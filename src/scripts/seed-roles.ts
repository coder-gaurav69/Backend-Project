import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const roles = [
        { name: 'Supervisor', description: 'Oversees operations and users. Can view reports and has limited configuration access.' },
        { name: 'Support', description: 'Provides technical assistance. Can access user accounts and system reports for diagnostics.' },
        { name: 'User', description: 'Access to basic features necessary for tasks. Limited administrative privileges.' },
        { name: 'Auditor', description: 'Reviews system activities. Can access reports, but cannot make changes.' },
        { name: 'Guest', description: 'Temporary access to limited features. Ideal for visitors or temporary users.' },
    ];

    console.log('Seeding roles...');

    for (const role of roles) {
        await prisma.role.upsert({
            where: { name: role.name },
            update: {},
            create: role,
        });
    }

    console.log('Roles seeded successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
