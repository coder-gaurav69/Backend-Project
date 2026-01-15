# HRMS Client Group API Documentation

This document covers all endpoints for managing Client Groups. All endpoints require **Authentication (Bearer Token)**.

## Base URL
`http://localhost:3000/api/v1/client-groups`

---

## 1. Internal Management (CRUD)

### Create Client Group
**Endpoint:** `POST /`
**Roles:** ADMIN, SUPER_ADMIN, HR
**Body:**
```json
{
  "groupNo": "101",
  "groupName": "Premium Clients",
  "groupCode": "PCL01",
  "country": "India",
  "remark": "High priority group"
}
```

### Update Client Group
**Endpoint:** `PUT /:id`
**Roles:** ADMIN, SUPER_ADMIN, HR
**Body:** Identical to Create, but all fields are optional.

### Delete Client Group (Soft Delete)
**Endpoint:** `DELETE /:id`
**Roles:** ADMIN, SUPER_ADMIN

---

## 2. Retrieval & Filtering

### List All Client Groups (Paginated)
**Endpoint:** `GET /`
**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)
- `search` (Search by Name/Code/Number)
- `status` (ACTIVE/INACTIVE)

### List Active Client Groups
**Endpoint:** `GET /active`

### Get Single Client Group
**Endpoint:** `GET /:id` OR `GET /by-code/:groupCode`

---

## 3. Bulk Operations

### Bulk Create
**Endpoint:** `POST /bulk/create`
**Body:**
```json
{
  "groups": [
    { "groupNo": "102", "groupName": "Global", "groupCode": "GL01", "country": "USA" },
    { "groupNo": "103", "groupName": "Local", "groupCode": "LC01", "country": "India" }
  ]
}
```

### Bulk Update
**Endpoint:** `PUT /bulk/update`
**Body:**
```json
{
  "groups": [
    { "id": "uuid-1", "groupName": "Updated Name" },
    { "id": "uuid-2", "groupName": "Updated Name 2" }
  ]
}
```

### Bulk Delete
**Endpoint:** `DELETE /bulk/delete`
**Body:**
```json
{
  "ids": ["uuid-1", "uuid-2"]
}
```

---

## 4. Special Actions

### Change Status
**Endpoint:** `PATCH /:id/status`
**Body:** `{ "status": "INACTIVE" }`

### Upload Excel
**Endpoint:** `POST /upload/excel`
**Content-Type:** `multipart/form-data`
**Field Name:** `file`
**Description:** Batch upload client groups via Excel file.
