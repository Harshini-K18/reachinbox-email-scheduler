import { prisma } from "../db/prisma";

const seed = async () => {
  try {
    const user = await prisma.user.upsert({
      where: {
        email: "dev@reachinbox.test",
      },
      update: {},
      create: {
        googleId: "dev-google-user-1",
        name: "Development User",
        email: "dev@reachinbox.test",
        avatar: null,
      },
    });

    const sender = await prisma.sender.upsert({
      where: {
        id: "dev-sender-1",
      },
      update: {},
      create: {
        id: "dev-sender-1",
        userId: user.id,
        name: "Development Sender",
        email: "dev@reachinbox.test",
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpUser: "PENDING",
        smtpPassword: "PENDING",
      },
    });

    console.log("Development user created/found:");
    console.log(user);

    console.log("Development sender created/found:");
    console.log(sender);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

seed();