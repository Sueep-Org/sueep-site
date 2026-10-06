import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/referrals",
        destination: "/referral",
        permanent: true,
      },
      // The old staff-shared turnover form was removed; the website's
      // Submit a Request form does the same job. The app subdomain sends
      // everything else into /erp, so it goes to the main site instead.
      {
        source: "/janitorial-turnover",
        has: [{ type: "host", value: "app.sueep.com" }],
        destination: "https://sueep.com/turnover-requests",
        permanent: true,
      },
      {
        source: "/janitorial-turnover",
        destination: "/turnover-requests",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
