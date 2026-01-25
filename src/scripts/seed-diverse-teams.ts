import { PrismaClient, UserRole, TeamStatus, LoginMethod } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient(
    process.argv[2]
        ? {
            datasources: {
                db: {
                    url: process.argv[2],
                },
            },
        }
        : undefined,
);

const USERS_TO_CREATE = [
    {
        teamName: 'Super Admin User',
        email: 'superadmin@example.com',
        role: UserRole.SUPER_ADMIN,
        phone: '9999999001',
        teamNo: 'SA-001',
    },
    {
        teamName: 'HR Manager',
        email: 'hr@example.com',
        role: UserRole.HR,
        phone: '9999999002',
        teamNo: 'HR-001',
    },
    {
        teamName: 'Project Manager',
        email: 'manager@example.com',
        role: UserRole.MANAGER,
        phone: '9999999003',
        teamNo: 'PM-001',
    },
    {
        teamName: 'Senior Employee',
        email: 'employee@example.com',
        role: UserRole.EMPLOYEE,
        phone: '9999999004',
        teamNo: 'EMP-001',
    },
];

async function main() {
    console.log('🚀 Starting multi-role team seeding...');

    // Check for IP argument (3rd arg if DB URL is active, or we check both positions)
    const args = process.argv.slice(2);
    // Rough check: is it a postgres URL?
    const dbUrl = args.find(arg => arg.startsWith('postgres'));
    // Rough check: is it an IP? (contains dots or colons and is NOT postgres)
    // If no IP is provided, consistent with "fix it once", we default to '*' to allow all IPs for these test users.
    const ipAddress = args.find(arg => !arg.startsWith('postgres') && (arg.includes('.') || arg.includes(':'))) || '*';

    if (ipAddress) {
        console.log(`ℹ️  IP Address provided (or default): ${ipAddress}. Updating allowed IPs for seeded users...`);
    }

    const saltRounds = 12;
    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

    for (const user of USERS_TO_CREATE) {
        const existingUser = await prisma.team.findFirst({
            where: {
                OR: [{ email: user.email }, { teamNo: user.teamNo }],
            },
        });

        if (existingUser) {
            if (ipAddress) {
                // Check if IP is already in allowedIps
                const currentIps = existingUser.allowedIps || [];
                if (!currentIps.includes(ipAddress)) {
                    await prisma.team.update({
                        where: { id: existingUser.id },
                        data: {
                            allowedIps: {
                                push: ipAddress
                            }
                        }
                    });
                    console.log(`🔄 Updated IP for ${user.teamName}: Added ${ipAddress}`);
                } else {
                    console.log(`ℹ️  User ${user.teamName} already has whitelist IP ${ipAddress}.`);
                }
            } else {
                console.log(`⚠️  User ${user.teamName} (${user.role}) already exists. Skipping...`);
            }
            continue;
        }

        const newUser = await prisma.team.create({
            data: {
                teamName: user.teamName,
                email: user.email,
                phone: user.phone,
                teamNo: user.teamNo,
                role: user.role,
                password: hashedPassword,
                status: TeamStatus.Active,
                loginMethod: LoginMethod.General,
                isEmailVerified: true,
                allowedIps: ipAddress ? [ipAddress] : [],
            },
        });

        console.log(`✅ Created: ${newUser.teamName} [${newUser.role}] - ${newUser.email}`);
    }

    console.log('\n✨ Seeding completed successfully!');
    console.log(`🔑 Default Password for all users: ${defaultPassword}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
