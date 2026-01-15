# HRMS Authentication API Documentation

This document explains the high-security authentication flow, including Registration and Login with mandatory OTP and IP validation.

## Base URL
`http://localhost:3000/api/v1/auth`

---

## 1. Registration Flow (Two-Step)

### Step 1: Submit Registration Details
**Endpoint:** `POST /register`
**Description:** Submits user details. Backend generates an OTP and sends it via Email/SMS. User is NOT created in the database yet.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "otpChannel": "EMAIL" // or "SMS"
}
```

**Postman Action:** 
- Send the request.
- Check your email/logs for the OTP.

---

### Step 2: Verify OTP & Activate Account
**Endpoint:** `POST /verify-otp`
**Description:** Verifies the OTP. If successful, the user is created in the database. The IP address used for this request is saved as the **Trusted IP**.

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Postman Action:**
- Use the OTP received in Step 1.
- Once success, your account is active and your current IP is whitelisted.

---

## 2. Login Flow (Two-Step & Strict IP)

### Step 1: Submit Credentials
**Endpoint:** `POST /login`
**Description:** Verifies email and password. If correct, generates and sends a Login OTP.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Postman Action:**
- Send request.
- Check logs/email for the Login OTP.

---

### Step 2: Verify Login OTP & IP Validation
**Endpoint:** `POST /verify-login`
**Description:** Final step of login. Backend verifies the OTP AND checks if the current request IP matches the IP saved during registration.

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "654321"
}
```

**Postman Action:**
- **Success Case:** Returns `accessToken`, `refreshToken`, and `sessionId`.
- **Failure Case (Wrong IP):** If you try this from a different device/network than the one used for registration verification, it will return `401 Unauthorized - Access denied. Unrecognized IP address.`

---

## 3. Token & Session Management

### Refresh Token
**Endpoint:** `POST /refresh`
**Request Body:**
```json
{
  "refreshToken": "YOUR_REFRESH_TOKEN"
}
```

### Logout
**Endpoint:** `POST /logout` (Requires Bearer Token)
**Headers:** `Authorization: Bearer <accessToken>`
**Request Body:**
```json
{
  "sessionId": "YOUR_SESSION_ID"
}
```

### Get Profile
**Endpoint:** `GET /profile` (Requires Bearer Token)
**Headers:** `Authorization: Bearer <accessToken>`
