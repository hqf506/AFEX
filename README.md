This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Support email notifications

Direct Support email alerts use Resend from server route handlers. Configure these server-only deployment variables:

- `RESEND_API_KEY`
- `SUPPORT_EMAIL_FROM` (for example, `AFEX Support <support@example.com>`)
- `SUPPORT_EMAIL_REPLY_TO` (optional)
- `AFEX_APP_BASE_URL` (the authenticated AFEX application origin)
- `SUPPORT_EMAIL_NOTIFICATIONS_ENABLED` (defaults to disabled)
- `SUPPORT_EMAIL_NEW_TICKET_ENABLED` (defaults to enabled when the master switch is enabled)
- `SUPPORT_EMAIL_CUSTOMER_REPLY_ENABLED` (defaults to enabled when the master switch is enabled)
- `CUSTOMER_EMAIL_NOTIFICATIONS_ENABLED` (defaults to disabled)
- `CUSTOMER_EMAIL_PROVIDER_REPLY_ENABLED` (defaults to enabled when customer notifications are enabled)
- `CUSTOMER_EMAIL_STATUS_ENABLED` (defaults to enabled when customer notifications are enabled)
- `WELCOME_EMAIL_NOTIFICATIONS_ENABLED` (defaults to disabled; enables eligible new-account welcome emails)
- `AUTH_RECOVERY_STATE_SECRET` (server-only, at least 32 random characters; signs short-lived password-recovery context)

Do not expose these variables through `NEXT_PUBLIC_` names. Email delivery is best-effort after the customer response and does not change a successful ticket or reply result.
