const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  basePath: isProd ? '/campaign' : '',
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? '/campaign' : '',
  },
};

export default nextConfig;
