import React, {useEffect} from 'react';
import {withOnyx} from 'react-native-onyx';
import FullScreenLoadingIndicator from '@components/FullscreenLoadingIndicator';
import Navigation from '@libs/Navigation/Navigation';
import * as Session from '@userActions/Session';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {ValidateLoginPageOnyxNativeProps, ValidateLoginPageProps} from './types';

function ValidateLoginPage({
    route: {
        params: {accountID, validateCode, exitTo},
    },
    session,
}: ValidateLoginPageProps<ValidateLoginPageOnyxNativeProps>) {
    const handleNavigation = () => {
        if (exitTo) {
            Session.handleExitToNavigation(exitTo);
        } else if (session?.authToken) {
            // If already signed in, do not show the validate code if not on web,
            // because we don't want to block the user with the interstitial page.
            Navigation.goBack();
        } else {
            Navigation.navigate(ROUTES.HOME);
        }
    };

    useEffect(() => {
        // Wait till navigation becomes available
        Navigation.isNavigationReady().then(() => {
            if (session?.authToken) {
                handleNavigation();
            } else {
                Session.signInWithValidateCode(Number(accountID), validateCode);
                handleNavigation();
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (session?.autoAuthState !== CONST.AUTO_AUTH_STATE.FAILED) {
            return;
        }
        // Go back to initial route if validation fails
        Navigation.isNavigationReady().then(() => {
            Navigation.goBack();
        });
    }, [session?.autoAuthState]);

    return <FullScreenLoadingIndicator />;
}

ValidateLoginPage.displayName = 'ValidateLoginPage';

export default withOnyx<ValidateLoginPageProps<ValidateLoginPageOnyxNativeProps>, ValidateLoginPageOnyxNativeProps>({
    session: {key: ONYXKEYS.SESSION},
})(ValidateLoginPage);
