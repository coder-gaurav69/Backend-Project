# API Usage Guide

This guide details how to use the HRMS Backend APIs, specifically focusing on the new Multi-Channel OTP Registration features.

## 1. Authentication

### Register a New User

The registration process supports two channels for OTP delivery: `EMAIL` and `SMS`.

**Endpoint:** `POST /api/v1/auth/register`

**Headers:**
- `Content-Type: application/json`

#### Option A: Register with Email OTP (Default)

If `otpChannel` is omitted, it defaults to `EMAIL`.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "otpChannel": "EMAIL" 
}
```

**Response:**
```json
{
  "message": "OTP sent to email. Please verify to complete registration.",
  "email": "user@example.com",
  "channel": "EMAIL"
}
```

#### Option B: Register with SMS OTP

To use SMS, set `otpChannel` to `SMS` and provide a valid `phoneNumber` (in E.164 format, e.g., `+1234567890`).

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+15550101234",
  "otpChannel": "SMS"
}
```

**Response:**
```json
{
  "message": "OTP sent to phone. Please verify to complete registration.",
  "email": "user@example.com",
  "channel": "SMS"
}
```

### Verify OTP

After receiving the OTP via Email or SMS, use this endpoint to complete registration.

**Endpoint:** `POST /api/v1/auth/verify-otp`

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "message": "Account created and verified successfully. You can now login."
}
```

### Login

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

**Response:**
```json
{
  "message": "Credentials verified. Please verify OTP to complete login.",
  "email": "user@example.com"
}
```

---

## 2. Configuration Setup

To enable sending emails and SMS, you must configure the `.env` file with your provider credentials.

### Email (SMTP)
Find the section `# EMAIL (SMTP) CONFIGURATION` in `.env`:
- `SMTP_HOST`: e.g., `smtp.gmail.com`
- `SMTP_USER`: Your email address
- `SMTP_PASS`: Your app password (not your login password)

### SMS (Twilio)
Find the section `# SMS (TWILIO) CONFIGURATION` in `.env`:
- `TWILIO_SID`: Account SID from Twilio Console
- `TWILIO_AUTH_TOKEN`: Auth Token
- `TWILIO_FROM`: Your Twilio phone number
