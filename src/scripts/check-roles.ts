import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const users = ['hr-01@investationteam.com', 'admin-01@investationteam.com', 'employee-01@investationteam.com'];
    const teams = await prisma.team.findMany({
        where: {
            email: { in: users }
        },
        select: {
            email: true,
            role: true,
            teamName: true
        }
    });
    console.log(JSON.stringify(teams, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
