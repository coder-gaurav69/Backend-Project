import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const allPermissions = ['add', 'view', 'edit', 'delete', 'bulk', 'upload', 'download'];

const roles = [
    {
        name: 'Super Admin',
        description: 'Full system access. Can manage all modules, users, and configurations without restrictions.',
        permissions: {
            organization: allPermissions,
            project: allPermissions,
            users: allPermissions,
            group: allPermissions,
            ip_address: allPermissions,
            task: allPermissions,
            task_advance: ['self', 'others', 'groups']
        }
    },
    {
        name: 'HR Manager',
        description: 'Focuses on user management and organizational structure. Can manage employees and groups.',
        permissions: {
            organization: ['view', 'edit', 'download'],
            project: ['view'],
            users: allPermissions,
            group: allPermissions,
            ip_address: ['view'],
            task: ['view', 'download'],
            task_advance: ['self', 'others']
        }
    },
    {
        name: 'Project Manager',
        description: 'Manages projects and tasks. Oversight of project timelines and task assignments.',
        permissions: {
            organization: ['view'],
            project: allPermissions,
            users: ['view'],
            group: ['view'],
            ip_address: ['view'],
            task: allPermissions,
            task_advance: ['self', 'others', 'groups']
        }
    },
    {
        name: 'Team Lead',
        description: 'Supervises team tasks and group activities. Can assign and manage tasks within their scope.',
        permissions: {
            organization: ['view'],
            project: ['view'],
            users: ['view'],
            group: ['view'],
            ip_address: [],
            task: ['add', 'view', 'edit', 'bulk', 'upload', 'download'],
            task_advance: ['self', 'groups']
        }
    },
    {
        name: 'Employee',
        description: 'Standard access for performing assigned tasks and viewing relevant project information.',
        permissions: {
            organization: [],
            project: ['view'],
            users: [],
            group: [],
            ip_address: [],
            task: ['add', 'view', 'edit'],
            task_advance: ['self']
        }
    },
    {
        name: 'Auditor',
        description: 'Read-only access across the system for compliance and review purposes.',
        permissions: {
            organization: ['view', 'download'],
            project: ['view', 'download'],
            users: ['view', 'download'],
            group: ['view', 'download'],
            ip_address: ['view', 'download'],
            task: ['view', 'download'],
            task_advance: []
        }
    }
];

async function main() {
    console.log('🚀 Seeding Professional Roles...');

    for (const role of roles) {
        const upsertedRole = await prisma.role.upsert({
            where: { name: role.name },
            update: {
                description: role.description,
                permissions: role.permissions
            },
            create: {
                name: role.name,
                description: role.description,
                permissions: role.permissions
            },
        });
        console.log(`✅ Role "${upsertedRole.name}" seeded.`);
    }

    console.log('\n✨ All professional roles seeded successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding roles:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
