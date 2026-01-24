import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    const roles = await prisma.role.findMany();
    console.log('Roles found:', roles.length);
    console.log(JSON.stringify(roles, null, 2));

    const mapped = roles.map(role => ({
        ...role,
        users: [],
        accessRight: (role.permissions as any) || {}
    }));
    console.log('Mapped Roles:', mapped.length);
}

test()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
