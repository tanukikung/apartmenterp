# Extend the official OnlyOffice Document Server image with CORS-enabled nginx config.
# The custom ds-docservice.conf adds Access-Control-Allow-Origin headers so the
# browser SDK (loaded from localhost:3001) can embed the editor without CORS blocks.
#
# Rebuild after changing ds-docservice.conf:
#   docker build -t onlyoffice-cors -f docker/onlyoffice-nginx/Dockerfile .
# Then update docker-compose.yml to use: image: onlyoffice-cors
# Or keep the docker-compose override approach (see below).

FROM onlyoffice/documentserver:latest

# Copy the custom nginx config that includes CORS headers for browser SDK embedding.
# This overrides /etc/nginx/includes/ds-docservice.conf inside the container.
COPY onlyoffice-nginx/ds-docservice.conf /etc/nginx/includes/ds-docservice.conf
