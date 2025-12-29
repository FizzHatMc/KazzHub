# 1. Use Nginx
FROM nginx:alpine

# 2. Copy your files to the Nginx html folder
# This assumes your index.html is in the root of your repo
COPY . /usr/share/nginx/html

# 3. Expose port 80
EXPOSE 80

# 4. Start Nginx
CMD ["nginx", "-g", "daemon off;"]
