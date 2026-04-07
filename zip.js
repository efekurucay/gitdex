const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }

  return table;
})();

function zipCrc32(bytes) {
  let crc = 0xffffffff;

  for (const value of bytes) {
    crc = ZIP_CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function zipDosDateTime(value = new Date()) {
  const year = Math.max(1980, value.getFullYear());
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const seconds = Math.floor(value.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds
  };
}

function zipUint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function zipUint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function zipConcat(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function zipNormalizeBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new TextEncoder().encode(String(value ?? ''));
}

function createZipBlob(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('ZIP icin dosya bulunamadi.');
  }

  const encoder = new TextEncoder();
  const timestamp = zipDosDateTime();
  const localFileChunks = [];
  const centralDirectoryChunks = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileName = String(entry.name || '').replace(/^\/+/, '');
    if (!fileName) {
      continue;
    }

    const fileNameBytes = encoder.encode(fileName);
    const dataBytes = zipNormalizeBytes(entry.data);
    const crc32 = zipCrc32(dataBytes);
    const fileOffset = localOffset;

    const localHeader = zipConcat([
      zipUint32(0x04034b50),
      zipUint16(20),
      zipUint16(0x0800),
      zipUint16(0),
      zipUint16(timestamp.time),
      zipUint16(timestamp.date),
      zipUint32(crc32),
      zipUint32(dataBytes.length),
      zipUint32(dataBytes.length),
      zipUint16(fileNameBytes.length),
      zipUint16(0)
    ]);

    localFileChunks.push(localHeader, fileNameBytes, dataBytes);
    localOffset += localHeader.length + fileNameBytes.length + dataBytes.length;

    const centralHeader = zipConcat([
      zipUint32(0x02014b50),
      zipUint16(20),
      zipUint16(20),
      zipUint16(0x0800),
      zipUint16(0),
      zipUint16(timestamp.time),
      zipUint16(timestamp.date),
      zipUint32(crc32),
      zipUint32(dataBytes.length),
      zipUint32(dataBytes.length),
      zipUint16(fileNameBytes.length),
      zipUint16(0),
      zipUint16(0),
      zipUint16(0),
      zipUint16(0),
      zipUint32(0),
      zipUint32(fileOffset)
    ]);

    centralDirectoryChunks.push(centralHeader, fileNameBytes);
  }

  const localSection = zipConcat(localFileChunks);
  const centralDirectorySection = zipConcat(centralDirectoryChunks);

  const endOfCentralDirectory = zipConcat([
    zipUint32(0x06054b50),
    zipUint16(0),
    zipUint16(0),
    zipUint16(centralDirectoryChunks.length / 2),
    zipUint16(centralDirectoryChunks.length / 2),
    zipUint32(centralDirectorySection.length),
    zipUint32(localSection.length),
    zipUint16(0)
  ]);

  return new Blob([localSection, centralDirectorySection, endOfCentralDirectory], {
    type: 'application/zip'
  });
}

window.createZipBlob = createZipBlob;
