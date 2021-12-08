import _ from 'underscore';
import lodashGet from 'lodash/get';
import PropTypes from 'prop-types';
import React, {PureComponent} from 'react';
import {View, AppState} from 'react-native';
import Onyx, {withOnyx} from 'react-native-onyx';

import BootSplash from './libs/BootSplash';
import * as ActiveClientManager from './libs/ActiveClientManager';
import ONYXKEYS from './ONYXKEYS';
import NavigationRoot from './libs/Navigation/NavigationRoot';
import migrateOnyx from './libs/migrateOnyx';
import styles from './styles/styles';
import PushNotification from './libs/Notification/PushNotification';
import UpdateAppModal from './components/UpdateAppModal';
import Visibility from './libs/Visibility';
import GrowlNotification from './components/GrowlNotification';
import * as Growl from './libs/Growl';
import StartupTimer from './libs/StartupTimer';
import Log from './libs/Log';
import ConfirmModal from './components/ConfirmModal';
import {openOldDotLink} from './libs/actions/Link';

Onyx.registerLogger(({level, message}) => {
    if (level === 'alert') {
        Log.alert(message);
        console.error(message);
    } else {
        Log.info(message);
    }
});

const propTypes = {
    /* Onyx Props */

    /** Session info for the currently logged in user. */
    session: PropTypes.shape({

        /** Currently logged in user authToken */
        authToken: PropTypes.string,

        /** Currently logged in user accountID */
        accountID: PropTypes.number,
    }),

    /** Whether a new update is available and ready to install. */
    updateAvailable: PropTypes.bool,

    /** Whether the initial data needed to render the app is ready */
    initialReportDataLoaded: PropTypes.bool,

    /** Tells us if the sidebar has rendered */
    isSidebarLoaded: PropTypes.bool,

    /** Information about a screen share call requested by a GuidesPlus agent */
    screenShareRequested: PropTypes.objectOf(PropTypes.shape({
        accessToken: PropTypes.string,
        roomName: PropTypes.string,
    })),
};

const defaultProps = {
    session: {
        authToken: null,
        accountID: null,
    },
    updateAvailable: false,
    initialReportDataLoaded: false,
    isSidebarLoaded: false,
    screenShareRequested: null,
};

class Expensify extends PureComponent {
    constructor(props) {
        super(props);

        // Initialize this client as being an active client
        ActiveClientManager.init();
        this.hideSplash = this.hideSplash.bind(this);
        this.initializeClient = this.initializeClient.bind(true);
        this.state = {
            isOnyxMigrated: false,
        };
    }

    componentDidMount() {
        setTimeout(() => this.reportBootSplashStatus(), 30 * 1000);

        // This timer is set in the native layer when launching the app and we stop it here so we can measure how long
        // it took for the main app itself to load.
        StartupTimer.stop();

        // Run any Onyx schema migrations and then continue loading the main app
        migrateOnyx()
            .then(() => {
                // When we don't have an authToken we'll want to show the sign in screen immediately so we'll hide our
                // boot screen right away
                if (!this.getAuthToken()) {
                    this.hideSplash();

                    // In case of a crash that led to disconnection, we want to remove all the push notifications.
                    PushNotification.clearNotifications();
                }

                this.setState({isOnyxMigrated: true});
            });

        AppState.addEventListener('change', this.initializeClient);
    }

    componentDidUpdate(prevProps) {
        const previousAccountID = lodashGet(prevProps, 'session.accountID', null);
        const currentAccountID = lodashGet(this.props, 'session.accountID', null);
        if (currentAccountID && (currentAccountID !== previousAccountID)) {
            PushNotification.register(currentAccountID);
        }

        // If we previously had no authToken and now have an authToken we'll want to reshow the boot splash screen so
        // that we can remove it again once the content is ready
        const previousAuthToken = lodashGet(prevProps, 'session.authToken', null);
        if (this.getAuthToken() && !previousAuthToken) {
            this.showSplash();
        }

        if (this.getAuthToken() && this.props.initialReportDataLoaded && this.props.isSidebarLoaded) {
            this.hideSplash();
        }
    }

    componentWillUnmount() {
        AppState.removeEventListener('change', this.initializeClient);
    }

    getAuthToken() {
        return lodashGet(this.props, 'session.authToken', null);
    }

    initializeClient() {
        if (!Visibility.isVisible()) {
            return;
        }

        ActiveClientManager.init();
    }

    showSplash() {
        Log.info('[BootSplash] showing splash screen', false);
        BootSplash.show({fade: true});
    }

    hideSplash() {
        Log.info('[BootSplash] hiding splash screen', false);
        BootSplash.hide({fade: true})
            .catch(error => Log.alert('[BootSplash] hiding failed', {message: error.message, error}, false));
    }

    reportBootSplashStatus() {
        BootSplash.getVisibilityStatus()
            .then((status) => {
                Log.info('[BootSplash] splash screen status', false, {status});

                if (status === 'visible') {
                    const props = _.omit(this.props, ['children', 'session']);
                    props.hasAuthToken = !_.isEmpty(this.getAuthToken());
                    Log.alert('[BootSplash] splash screen is still visible', {props}, false);
                }
            });
    }

    render() {
        // Display a blank page until the onyx migration completes
        if (!this.state.isOnyxMigrated) {
            return (
                <View style={styles.genericView} />
            );
        }
        return (
            <>
                <GrowlNotification ref={Growl.growlRef} />
                {/* We include the modal for showing a new update at the top level so the option is always present. */}
                {this.props.updateAvailable ? <UpdateAppModal /> : null}
                <NavigationRoot authenticated={Boolean(this.getAuthToken())} />
                {this.props.screenShareRequested ? (
                    <ConfirmModal
                        // TODO add translations
                        title="Screen Share"
                        onConfirm={() => {
                            Onyx.set(ONYXKEYS.SCREEN_SHARE_REQUEST, null);
                            openOldDotLink(`inbox?action=screenShare&accessToken=${this.props.screenShareRequested.accessToken}&name=${this.props.screenShareRequested.roomName}`);
                        }}
                        onCancel={() => {
                            Onyx.set(ONYXKEYS.SCREEN_SHARE_REQUEST, null);
                        }}
                        prompt="Expensify is inviting you to screen share"
                        confirmText="Join"
                        cancelText="Decline"
                        isVisible
                    />
                ) : null}
            </>
        );
    }
}

Expensify.propTypes = propTypes;
Expensify.defaultProps = defaultProps;
export default withOnyx({
    session: {
        key: ONYXKEYS.SESSION,
    },
    updateAvailable: {
        key: ONYXKEYS.UPDATE_AVAILABLE,
        initWithStoredValues: false,
    },
    initialReportDataLoaded: {
        key: ONYXKEYS.INITIAL_REPORT_DATA_LOADED,
    },
    isSidebarLoaded: {
        key: ONYXKEYS.IS_SIDEBAR_LOADED,
    },
    screenShareRequested: {
        key: ONYXKEYS.SCREEN_SHARE_REQUEST,
    },
})(Expensify);
