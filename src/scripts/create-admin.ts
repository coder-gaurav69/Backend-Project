import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin-01@investationteam.com';
    const password = '123Qwe';
    const saltRounds = 10;

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Delete existing user if any to avoid conflict
    await prisma.user.deleteMany({
        where: { email }
    });

    const user = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            firstName: 'Investation',
            lastName: 'Admin',
            role: 'SUPER_ADMIN' as any,
            status: 'Active' as any,
            isEmailVerified: true,
            allowedIps: ['::1', '127.0.0.1'], // Allow local development IPs
        },
    });

    console.log('✅ Admin User Created Successfully!');
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
