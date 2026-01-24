import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin-01@investationteam.com';
    const password = '123Qwe';
    const saltRounds = 10;

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Delete existing team if any to avoid conflict
    const existing = await prisma.team.findUnique({ where: { email } });
    if (existing) {
        await prisma.team.delete({ where: { id: existing.id } });
    }

    const team = await prisma.team.create({
        data: {
            teamName: 'Investation Admin',
            teamNo: 'TM-ADMIN-01',
            email,
            password: hashedPassword,
            firstName: 'Investation',
            lastName: 'Admin',
            role: 'SUPER_ADMIN' as any,
            status: 'Active' as any,
            isEmailVerified: true,
            allowedIps: ['::1', '127.0.0.1'],
        },
    });

    console.log('✅ Admin Team Created Successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
}

main()
    .catch((e) => {
        console.error('❌ Error creating admin:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
