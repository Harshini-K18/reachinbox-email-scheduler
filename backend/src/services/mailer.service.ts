import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.ETHEREAL_HOST,
  port: env.ETHEREAL_PORT,
  secure: false,

  auth: {
    user: env.ETHEREAL_USER,
    pass: env.ETHEREAL_PASSWORD,
  },

  // Important for Render/cloud deployment
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,

  // Helps diagnose SMTP problems
  logger: true,
  debug: true,
});

type EmailAttachment = {
  name: string;
  type: string;
  dataUrl: string;
};

const dataUrlToAttachment = (
  attachment: EmailAttachment
) => {
  const match = attachment.dataUrl.match(
    /^data:([^;,]+)?;base64,(.+)$/s
  );

  if (!match) {
    throw new Error(
      `Invalid attachment data for ${attachment.name}`
    );
  }

  return {
    filename: attachment.name,
    content: Buffer.from(match[2], "base64"),
    contentType:
      attachment.type ||
      match[1] ||
      "application/octet-stream",
  };
};

export const sendEmail = async ({
  to,
  subject,
  body,
  from,
  attachments = [],
}: {
  to: string;
  subject: string;
  body: string;
  from: string;
  attachments?: EmailAttachment[];
}) => {
  console.log("SMTP: Starting email send...");
  console.log("SMTP host:", env.ETHEREAL_HOST);
  console.log("SMTP port:", env.ETHEREAL_PORT);
  console.log("SMTP user:", env.ETHEREAL_USER);

  try {
    console.log("SMTP: Verifying connection...");

    await transporter.verify();

    console.log("SMTP: Connection verified.");

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      attachments: attachments.map(
        dataUrlToAttachment
      ),
    });

    console.log(
      "SMTP: Email sent:",
      info.messageId
    );

    return {
      messageId: info.messageId,
      previewUrl:
        nodemailer.getTestMessageUrl(info),
    };
  } catch (error) {
    console.error(
      "SMTP SEND ERROR:",
      error
    );

    throw error;
  }
};