# API Documentation for Postman Testing

Base URL: `http://localhost:3000` (Assuming default port, adjust if needed)

## 1. Authentication (`/api/v1/auth`)

### Register (Step 1: Initiate)
*   **Endpoint:** `/api/v1/auth/register`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "email": "user@example.com",
      "password": "password123",
      "firstName": "John",
      "lastName": "Doe"
    }
    ```
    *Returns: "OTP sent to email..."*

### Verify Registration OTP (Step 2: Complete)
*   **Endpoint:** `/api/v1/auth/verify-otp`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "email": "user@example.com",
      "otp": "123456"
    }
    ```
    > **Note:** Get OTP from server logs. This step creates the user and saves the IP.

### Login (Step 1: Validate & Request OTP)
*   **Endpoint:** `/api/v1/auth/login`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "email": "user@example.com",
      "password": "password123"
    }
    ```
    *Returns: "Credentials verified..."*

### Verify Login OTP (Step 2: Authenticate)
*   **Endpoint:** `/api/v1/auth/verify-login`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "email": "user@example.com",
      "otp": "123456"
    }
    ```
    > **Note:** Strict IP check applies here. Must match Registration IP. Returns JWT tokens.

### Refresh Token
*   **Endpoint:** `/api/v1/auth/refresh`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "refreshToken": "your_refresh_token_here"
    }
    ```

### Logout
*   **Endpoint:** `/api/v1/auth/logout`
*   **Method:** `POST`
*   **Headers:**
    *   `Authorization`: `Bearer your_access_token_here`
*   **Body (JSON):**
    ```json
    {
      "sessionId": "session_id_from_login_response"
    }
    ```

### Change Password
*   **Endpoint:** `/api/v1/auth/change-password`
*   **Method:** `PATCH`
*   **Headers:**
    *   `Authorization`: `Bearer your_access_token_here`
*   **Body (JSON):**
    ```json
    {
      "oldPassword": "password123",
      "newPassword": "newPassword456"
    }
    ```

### Forgot Password
*   **Endpoint:** `/api/v1/auth/forgot-password`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "email": "user@example.com"
    }
    ```

### Reset Password
*   **Endpoint:** `/api/v1/auth/reset-password`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "email": "user@example.com",
      "otp": "123456",
      "newPassword": "newPassword456"
    }
    ```
    > **Note:** Similar to registration, the password reset OTP is also logged to the server console. Look for `[AuthService] Password reset OTP for user@example.com: 123456`.

### Get Profile
*   **Endpoint:** `/api/v1/auth/profile`
*   **Method:** `GET`
*   **Headers:**
    *   `Authorization`: `Bearer your_access_token_here`

---

## 2. Client Groups (`/api/v1/client-groups`)
*Requires `Authorization: Bearer <token>` for most endpoints. Admin/HR roles required for mutation operations.*

### Create Client Group
*   **Endpoint:** `/api/v1/client-groups`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "groupNo": "CG001",
      "groupName": "Acme Corp",
      "groupCode": "ACME",
      "country": "USA",
      "status": "ACTIVE",  // Optional: "ACTIVE" or "INACTIVE"
      "remark": "Primary client group" // Optional
    }
    ```

### Find All (with Filtering & Pagination)
*   **Endpoint:** `/api/v1/client-groups`
*   **Method:** `GET`
*   **Query Params (Optional):**
    *   `page`: `1`
    *   `limit`: `10`
    *   `status`: `ACTIVE`
    *   `country`: `USA`
    *   `groupCode`: `ACME`

### Find Active
*   **Endpoint:** `/api/v1/client-groups/active`
*   **Method:** `GET`

### Find By ID
*   **Endpoint:** `/api/v1/client-groups/:id`
*   **Method:** `GET`

### Find By Group Code
*   **Endpoint:** `/api/v1/client-groups/by-code/:groupCode`
*   **Method:** `GET`

### Update Client Group
*   **Endpoint:** `/api/v1/client-groups/:id`
*   **Method:** `PUT`
*   **Body (JSON):**
    ```json
    {
      "groupName": "Acme Corp Updated",
      "country": "Canada"
    }
    ```

### Change Status
*   **Endpoint:** `/api/v1/client-groups/:id/status`
*   **Method:** `PATCH`
*   **Body (JSON):**
    ```json
    {
      "status": "INACTIVE"
    }
    ```

### Delete Client Group
*   **Endpoint:** `/api/v1/client-groups/:id`
*   **Method:** `DELETE`

### Bulk Create
*   **Endpoint:** `/api/v1/client-groups/bulk/create`
*   **Method:** `POST`
*   **Body (JSON):**
    ```json
    {
      "clientGroups": [
        {
          "groupNo": "CG002",
          "groupName": "Beta Ltd",
          "groupCode": "BETA",
          "country": "UK"
        },
        {
          "groupNo": "CG003",
          "groupName": "Gamma Inc",
          "groupCode": "GAMMA",
          "country": "India"
        }
      ]
    }
    ```

### Bulk Update
*   **Endpoint:** `/api/v1/client-groups/bulk/update`
*   **Method:** `PUT`
*   **Body (JSON):**
    ```json
    {
      "updates": [
        {
          "id": "uuid-1",
          "groupName": "Beta Ltd Updated"
        },
        {
          "id": "uuid-2",
          "status": "INACTIVE"
        }
      ]
    }
    ```

### Bulk Delete
*   **Endpoint:** `/api/v1/client-groups/bulk/delete`
*   **Method:** `DELETE`
*   **Body (JSON):**
    ```json
    {
      "ids": ["uuid-1", "uuid-2"]
    }
    ```

### Restore Deleted
*   **Endpoint:** `/api/v1/client-groups/:id/restore`
*   **Method:** `PATCH`

### Upload Excel
*   **Endpoint:** `/api/v1/client-groups/upload/excel`
*   **Method:** `POST`
*   **Body (Form-Data):**
    *   Key: `file`
    *   Value: (Select Excel file)
