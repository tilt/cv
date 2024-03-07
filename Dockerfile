# Use Ruby 2.7 as the base image
FROM ruby:2.7

# Install Node.js for JavaScript runtime
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash - && \
    apt-get update && apt-get install -y nodejs

# Install Bower and necessary tools
RUN npm install -g bower

# Create a directory for your app
WORKDIR /usr/src/app

# Copy your Gemfile and Gemfile.lock into the image
COPY Gemfile* ./

# Install Middleman and other dependencies
RUN bundle install

# Copy your application into the image
COPY . .

# Install Bower dependencies
RUN bower install --allow-root

# Expose port 4567 for Middleman server
EXPOSE 4567

RUN rm -rf build

# Command to build your site
# If you need to serve the site with Middleman (for development), you can adjust this command.
CMD ["bundle", "exec", "middleman", "build"]
