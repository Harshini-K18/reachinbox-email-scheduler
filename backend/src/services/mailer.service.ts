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
});

type EmailAttachment = {
  name: string;
  type: string;
  dataUrl: string;
};

const dataUrlToAttachment = (attachment: EmailAttachment) => {
  const match = attachment.dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/s);

  if (!match) {
    throw new Error(`Invalid attachment data for ${attachment.name}`);
  }

  return {
    filename: attachment.name,
    content: Buffer.from(match[2], "base64"),
    contentType: attachment.type || match[1] || "application/octet-stream",
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
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    attachments: attachments.map(dataUrlToAttachment),
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
};
