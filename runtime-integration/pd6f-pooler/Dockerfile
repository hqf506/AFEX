# syntax=docker/dockerfile:1.7
FROM --platform=linux/amd64 alpine:3.22.5@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce AS build

# Every x86_64 APK in the complete build dependency closure is fetched by an
# exact versioned URL and verified by BuildKit before local, offline resolution.
ADD --checksum=sha256:d12005fc43aa4e818ce240dcdd5ae90a42a5a4b3ea6937800c7b0a5b877190aa https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/binutils-2.44-r3.apk /packages/
ADD --checksum=sha256:1397ec9682ff6153e5d037965c76408e570ae6535ce479cc2af37436fdea52ce https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/c-ares-1.34.8-r0.apk /packages/
ADD --checksum=sha256:0e365cfb2beee01bfc3ee587c498adbd47c33658a8ab1ccadc5fc18e306265b1 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/c-ares-dev-1.34.8-r0.apk /packages/
ADD --checksum=sha256:4fd10bd05784f596e5ff0adc724a94b71380fac0ac276bd257dd861e8b5822e6 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/gcc-14.2.0-r6.apk /packages/
ADD --checksum=sha256:cb524a457ffbd9c79c6711d9ee883a64a5a9bc6aec4f4b4d047ee67527ac6e6d https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/gdbm-1.24-r0.apk /packages/
ADD --checksum=sha256:d3f987ae3836ac7774324bff443dd49d03b846209660729d0c30dfff5546e138 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/gmp-6.3.0-r3.apk /packages/
ADD --checksum=sha256:05bf7a0fe8aad4e1a6cb38ef2dbeac0a2fd05be2bfe862e3d84601b6c3c4f0b6 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/isl25-0.25-r2.apk /packages/
ADD --checksum=sha256:7fde81421482507163410715a7ef7d7df6a091870edab855c24e8f6fc84e3e2d https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/jansson-2.14.1-r0.apk /packages/
ADD --checksum=sha256:e9a884f8a63f614b722dd5191ede154a6b6b81d99457af610bc6f544a6d2d7bc https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libatomic-14.2.0-r6.apk /packages/
ADD --checksum=sha256:0c98810f9332bf1bb1b0acc64eaac4b101036689bffba9ea621416b4b3c190cd https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libbz2-1.0.8-r6.apk /packages/
ADD --checksum=sha256:4ae7959ca1501c78437ee8250a624e2149405955b05abe94f8cf68358ded05e9 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libcrypto3-3.5.7-r0.apk /packages/
ADD --checksum=sha256:3f90298882aa3a15f5e2eaef27985f2ad3f1dc909fbb3c96787d6cdc0eae8402 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libevent-2.1.13-r0.apk /packages/
ADD --checksum=sha256:9a02f82a3b327e3345be038ddde9a95e8fa43d785d1ce1800bf8655dd4ac5539 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libevent-dev-2.1.13-r0.apk /packages/
ADD --checksum=sha256:b426fe830190eb298312167cd9e2ba0e737d8951d60afe4f2eb626f77eed8b9d https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libexpat-2.8.2-r0.apk /packages/
ADD --checksum=sha256:9a75cb9024693c1e52c3d8d7c9afb7c79e6e20f6c08df28effdb8dd816095083 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libffi-3.4.8-r0.apk /packages/
ADD --checksum=sha256:04f3467bc967e705221a843fe4d3de5850db826e571686e0c0ed453d38cb5c59 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libgcc-14.2.0-r6.apk /packages/
ADD --checksum=sha256:026e5c9d0bab7e82c42fa11b96ed95e66d2549bd5de5c869c18a3600c2e3aa02 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libgomp-14.2.0-r6.apk /packages/
ADD --checksum=sha256:aeafdfca68147b014705b4e2564639ade6345198debb522f2c6c51d32e417651 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libncursesw-6.5_p20250503-r0.apk /packages/
ADD --checksum=sha256:046257a4535a9ced124595a33053948f6bf8b2f02988fefd1108f514d213ad4b https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libpanelw-6.5_p20250503-r0.apk /packages/
ADD --checksum=sha256:a3c2fa13023e88bf4f8dfe0e8847dcc1e2c1170be99969d761733e92b80dffa8 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libssl3-3.5.7-r0.apk /packages/
ADD --checksum=sha256:939f7c99898f3e8154207a17f4acbe8bc40437e1bb1b43f5525620ca9e452a2e https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/libstdc++-14.2.0-r6.apk /packages/
ADD --checksum=sha256:5b66eb4c2db0b0452f1c88d19909397f09e72425d1d9769a480d6370d8a9c310 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/make-4.4.1-r3.apk /packages/
ADD --checksum=sha256:bfc0d8bd7e3b8de2fdfcf4977437281e58147cc568194cb82ba887bd190376e6 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/mpc1-1.3.1-r1.apk /packages/
ADD --checksum=sha256:28f3d868efbc1e9093b95f4a3f6e74393acd4a37292fcb5c0e0e0612fe83fff3 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/mpdecimal-4.0.1-r0.apk /packages/
ADD --checksum=sha256:33f2f274333164dfc25a0002ca58bb99f6d26843d5486c03e3fa207e5432ac59 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/mpfr4-4.2.1_p1-r0.apk /packages/
ADD --checksum=sha256:4990a5e0ba312e478f94cfe431a70efef1538004eb361c8ae424516848be45bb https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/musl-1.2.5-r12.apk /packages/
ADD --checksum=sha256:1c2068d910cfdbbcb4eb107a5a478f8b48edf3a6311953c8fa5180c5190efab3 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/musl-dev-1.2.5-r12.apk /packages/
ADD --checksum=sha256:0815a5f0403974bb9c34d456e71dc9c0222cb5455d393bc63c44b573da3d7fe0 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/ncurses-terminfo-base-6.5_p20250503-r0.apk /packages/
ADD --checksum=sha256:e7c16f84972231980b2d6a5ada3f9144da1a57eeea00e8b3119bed68cca5f4f1 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/openssl-dev-3.5.7-r0.apk /packages/
ADD --checksum=sha256:32ed811fa76f5f380cda11aa5bdf2f93727760dc4c6d6de5f06dd4c66e3fe3ba https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/pkgconf-2.4.3-r0.apk /packages/
ADD --checksum=sha256:7167845a1d39b9e268d9821e18f0457e43a65a155fc9faa553a28e42aedd30e0 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/python3-3.12.13-r0.apk /packages/
ADD --checksum=sha256:520fa586c689144928191bee13e2c85ff4e170ad87d1471ec48e3e97611673d8 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/readline-8.2.13-r1.apk /packages/
ADD --checksum=sha256:7af9a58595642de91ea35d3d070cd38d969680a720ce76b14966859e6fb4af99 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/sqlite-libs-3.49.2-r1.apk /packages/
ADD --checksum=sha256:ebb49f0e8efb6ac774d5d8f21a7cf7d63c4658fa36ab1ebaf48ebd67efd60142 https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/xz-libs-5.8.3-r0.apk /packages/
ADD --checksum=sha256:1f3d5f463f490dad3a68097376711bfe5e8156e9e8daff3070513aa4378cdeca https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/zlib-1.3.2-r0.apk /packages/
ADD --checksum=sha256:1bdd6e57cfbfbfd6e8481cad37ddd5d199950715bec1879b3afb600272dbb09e https://dl-cdn.alpinelinux.org/alpine/v3.22/main/x86_64/zstd-libs-1.5.7-r0.apk /packages/

ADD --checksum=sha256:924ad35113fd0a71c8e2dbe85b5d03445532e2b7b37a9f8a48983beea238b332 https://github.com/pgbouncer/pgbouncer/releases/download/pgbouncer_1_25_2/pgbouncer-1.25.2.tar.gz /tmp/pgbouncer.tar.gz

RUN apk add --no-network --allow-untrusted /packages/*.apk \
    && mkdir /tmp/pgbouncer \
    && tar --extract --gzip --file /tmp/pgbouncer.tar.gz --directory /tmp/pgbouncer --strip-components=1 \
    && cd /tmp/pgbouncer \
    && ./configure --prefix=/usr --with-libevent=libevent --with-cares \
    && make -j2 pgbouncer \
    && install -D -m0755 pgbouncer /out/usr/bin/pgbouncer

FROM --platform=linux/amd64 alpine:3.22.5@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce

COPY --from=build /packages/c-ares-1.34.8-r0.apk /packages/
COPY --from=build /packages/libcrypto3-3.5.7-r0.apk /packages/
COPY --from=build /packages/libevent-2.1.13-r0.apk /packages/
COPY --from=build /packages/libssl3-3.5.7-r0.apk /packages/
RUN apk add --no-network --allow-untrusted /packages/*.apk \
    && rm -rf /packages \
    && addgroup -S pgbouncer \
    && adduser -S -D -H -G pgbouncer pgbouncer

COPY --from=build /out/usr/bin/pgbouncer /usr/bin/pgbouncer
USER pgbouncer:pgbouncer
EXPOSE 6432
ENTRYPOINT ["/usr/bin/pgbouncer"]
CMD ["/etc/pgbouncer/pgbouncer.ini"]
