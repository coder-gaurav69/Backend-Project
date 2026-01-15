
export enum OtpChannel {
    EMAIL = 'EMAIL',
    SMS = 'SMS'
}

export interface NotificationStrategy {
    sendOtp(recipient: string, otp: string): Promise<boolean>;
    getChannelName(): OtpChannel;
}
