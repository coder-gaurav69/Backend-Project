# HRMS MODULES - COMPLETE IMPLEMENTATION GUIDE

## 🎯 What's Been Completed

### ✅ Core Infrastructure
1. **Prisma Schema** (`prisma/schema.prisma`)
   - All 7 tables: ClientCompany, ClientLocation, SubLocation, Project, Team, Group, IpAddress
   - Proper foreign key relationships
   - Soft delete support (deletedAt)
   - Audit trail fields (createdBy, updatedBy, deletedBy)
   - All necessary enums and indexes

2. **Reusable Services**
   - `src/common/services/auto-number.service.ts` - Generates sequential numbers for all modules
   - `src/common/services/excel-upload.service.ts` - Handles Excel/CSV parsing
   - `src/common/common.module.ts` - Global module

3. **Environment Configuration** (`.env`)
   ```
   CG_NUMBER_PREFIX=CG-  CG_NUMBER_START=11001
   CC_NUMBER_PREFIX=CC-  CC_NUMBER_START=11001
   CL_NUMBER_PREFIX=CL-  CL_NUMBER_START=11001
   CS_NUMBER_PREFIX=CS-  CS_NUMBER_START=11001
   P_NUMBER_PREFIX=P-    P_NUMBER_START=11001
   U_NUMBER_PREFIX=U-    U_NUMBER_START=11001
   G_NUMBER_PREFIX=G-    G_NUMBER_START=11001
   I_NUMBER_PREFIX=I-    I_NUMBER_START=11001
   ```

### ✅ Client Company Module (COMPLETE)
- `src/client-company/dto/client-company.dto.ts`
- `src/client-company/client-company.service.ts`
- `src/client-company/client-company.controller.ts`
- `src/client-company/client-company.module.ts`

**Features:**
- ✅ Full CRUD operations
- ✅ Bulk create/update/delete
- ✅ Excel/CSV upload
- ✅ Auto-generated companyNo (CC-11001, CC-11002, etc.)
- ✅ Soft delete & restore
- ✅ Redis caching
- ✅ Audit logging
- ✅ Relationship validation with ClientGroup

---

## 📋 Remaining Tasks

### 1. Complete Remaining 5 Modules

Each module needs 4 files following the EXACT pattern of Client Company:

#### **Client Location Module**
- [ ] `src/client-location/dto/client-location.dto.ts` ✅ (DONE)
- [ ] `src/client-location/client-location.service.ts`
- [ ] `src/client-location/client-location.controller.ts`
- [ ] `src/client-location/client-location.module.ts`

**Key Fields:**
- User fills: locationName, locationCode, companyId, address, status, remark
- Backend generates: locationNo (CL-11001)
- Relationship: belongs to ClientCompany

#### **Sub Location Module**
- [ ] `src/sub-location/dto/sub-location.dto.ts`
- [ ] `src/sub-location/sub-location.service.ts`
- [ ] `src/sub-location/sub-location.controller.ts`
- [ ] `src/sub-location/sub-location.module.ts`

**Key Fields:**
- User fills: subLocationName, subLocationCode, locationId, address, status, remark
- Backend generates: subLocationNo (CS-11001)
- Relationship: belongs to ClientLocation

#### **Project Module**
- [ ] `src/project/dto/project.dto.ts`
- [ ] `src/project/project.service.ts`
- [ ] `src/project/project.controller.ts`
- [ ] `src/project/project.module.ts`

**Key Fields:**
- User fills: projectName, subLocationId, deadline, priority, status, remark
- Backend generates: projectNo (P-11001)
- Relationship: belongs to SubLocation
- Additional enum: ProjectPriority (LOW, MEDIUM, HIGH, CRITICAL)

#### **Team Module**
- [ ] `src/team/dto/team.dto.ts`
- [ ] `src/team/team.service.ts`
- [ ] `src/team/team.controller.ts`
- [ ] `src/team/team.module.ts`

**Key Fields:**
- User fills: teamName, email, phone, taskAssignPermission, clientGroupId, companyId, locationId, subLocationId, status, loginMethod, remark
- Backend generates: teamNo (U-11001)
- Relationships: optional links to ClientGroup, Company, Location, SubLocation
- Additional enum: LoginMethod (EMAIL, PHONE, BOTH)

#### **Group Module**
- [ ] `src/group/dto/group.dto.ts`
- [ ] `src/group/group.service.ts`
- [ ] `src/group/group.controller.ts`
- [ ] `src/group/group.module.ts`

**Key Fields:**
- User fills: groupName, groupCode, clientGroupId, companyId, locationId, subLocationId, status, remark
- Backend generates: groupNo (G-11001)
- Relationships: optional links to ClientGroup, Company, Location, SubLocation

#### **IP Address Module**
- [ ] `src/ip-address/dto/ip-address.dto.ts`
- [ ] `src/ip-address/ip-address.service.ts`
- [ ] `src/ip-address/ip-address.controller.ts`
- [ ] `src/ip-address/ip-address.module.ts`

**Key Fields:**
- User fills: ipAddress, ipAddressName, clientGroupId, companyId, locationId, subLocationId, status, remark
- Backend generates: ipNo (I-11001)
- Relationships: optional links to ClientGroup, Company, Location, SubLocation

---

### 2. Update App Module

Add all new modules to `src/app.module.ts`:

```typescript
import { ClientCompanyModule } from './client-company/client-company.module';
import { ClientLocationModule } from './client-location/client-location.module';
import { SubLocationModule } from './sub-location/sub-location.module';
import { ProjectModule } from './project/project.module';
import { TeamModule } from './team/team.module';
import { GroupModule } from './group/group.module';
import { IpAddressModule } from './ip-address/ip-address.module';

@Module({
  imports: [
    // ... existing imports
    ClientCompanyModule,
    ClientLocationModule,
    SubLocationModule,
    ProjectModule,
    TeamModule,
    GroupModule,
    IpAddressModule,
  ],
})
```

---

### 3. Database Migration

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Or create migration (recommended for production)
npx prisma migrate dev --name add_all_hrms_modules
```

---

### 4. Build & Test

```bash
# Build the project
npm run build

# Start development server
npm run start:dev

# Test endpoints
# GET http://localhost:3000/api/v1/client-companies
# GET http://localhost:3000/api/v1/client-locations
# etc.
```

---

## 🔑 Implementation Pattern (Copy for Each Module)

### Service Template
```typescript
// 1. Import dependencies
import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AutoNumberService } from '../common/services/auto-number.service';
import { ExcelUploadService } from '../common/services/excel-upload.service';

// 2. Implement methods
- create() - with auto-number generation
- findAll() - with pagination & filters
- findActive()
- findById()
- findByCode()
- update()
- changeStatus()
- delete() - soft delete
- bulkCreate()
- bulkUpdate()
- bulkDelete()
- restore()
- uploadExcel()
- invalidateCache()
- logAudit()
```

### Controller Template
```typescript
// All endpoints with proper guards
@Controller('module-name')
export class ModuleController {
  // POST / - Create
  // GET / - List all
  // GET /active - List active
  // GET /:id - Get by ID
  // GET /by-code/:code - Get by code
  // PUT /:id - Update
  // PATCH /:id/status - Change status
  // DELETE /:id - Soft delete
  // POST /bulk/create - Bulk create
  // PUT /bulk/update - Bulk update
  // POST /bulk/delete-records - Bulk delete
  // PATCH /:id/restore - Restore
  // POST /upload/excel - Excel upload
}
```

---

## 🎨 Frontend Integration Checklist

For each module, create:

1. **API Service** (`src/services/api/[module].ts`)
   ```typescript
   export const apiGetModules = (params) => api.get('/modules', { params });
   export const apiCreateModule = (data) => api.post('/modules', data);
   export const apiUpdateModule = (id, data) => api.put(`/modules/${id}`, data);
   export const apiDeleteModule = (id) => api.delete(`/modules/${id}`);
   export const apiBulkCreateModules = (data) => api.post('/modules/bulk/create', data);
   export const apiUploadModuleExcel = (file) => {
     const formData = new FormData();
     formData.append('file', file);
     return api.post('/modules/upload/excel', formData);
   };
   ```

2. **List Page** - Table with pagination, search, filters, bulk actions
3. **Form Page** - Create/Edit with cascading dropdowns
4. **Store** (if using Zustand/Redux) - State management

---

## ⚡ Quick Reference: Auto-Number Prefixes

| Module | Prefix | Example | Service Method |
|--------|--------|---------|----------------|
| Client Group | CG- | CG-11001 | generateClientGroupNo() |
| Client Company | CC- | CC-11001 | generateCompanyNo() |
| Client Location | CL- | CL-11001 | generateLocationNo() |
| Sub Location | CS- | CS-11001 | generateSubLocationNo() |
| Project | P- | P-11001 | generateProjectNo() |
| Team | U- | U-11001 | generateTeamNo() |
| Group | G- | G-11001 | generateGroupNo() |
| IP Address | I- | I-11001 | generateIpNo() |

---

## 🚀 Next Steps

1. **Complete the remaining 5 modules** using Client Company as the exact reference
2. **Update app.module.ts** to import all new modules
3. **Run database migration** (`npx prisma db push`)
4. **Test all endpoints** using Postman/Thunder Client
5. **Integrate with React frontend** - Create API services and UI components

---

## 📞 Need Help?

If you need me to:
- Generate the complete code for any remaining module
- Create a script to automate the file generation
- Help with frontend integration
- Debug any issues

Just let me know which module or task you'd like me to focus on next!
