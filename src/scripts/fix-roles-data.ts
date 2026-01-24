import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Updating user roles...');

    // Fix admin-01
    await prisma.team.update({
        where: { email: 'admin-01@investationteam.com' },
        data: { role: 'ADMIN' }
    });
    console.log('Fixed role for admin-01 -> ADMIN');

    // Fix hr-01
    await prisma.team.update({
        where: { email: 'hr-01@investationteam.com' },
        data: { role: 'HR' }
    });
    console.log('Fixed role for hr-01 -> HR');

    console.log('Role update completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
