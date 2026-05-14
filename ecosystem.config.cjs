module.exports = {
  apps: [
    {
      name: "travel-planner",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
