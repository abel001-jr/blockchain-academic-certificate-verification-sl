# Install QR Scanner Features

## Quick Setup

Run these commands in the mobile-app directory:

```bash
# Install new dependencies
npm install

# Start the development server
npm start
```

## What's New?

### Dual QR Scanning Options:
1. **📷 Scan with Camera** - Real-time camera scanning
2. **🖼️ Upload QR Image** - Select QR from gallery/files

### New Packages Added:
- `expo-image-picker` - Native image selection
- `jsqr` - QR code decoder for uploaded images
- `expo-image-manipulator` - Image processing utilities

## Platform Support

| Feature | Web | iOS | Android |
|---------|-----|-----|---------|
| Camera Scan | ✅ | ✅ | ✅ |
| Upload & Decode | ✅ | ⚠️ | ⚠️ |
| Manual Entry | ✅ | ✅ | ✅ |

⚠️ On mobile devices, image upload suggests using camera scanner for best results

## Usage

### For Verifiers:
1. Open "Verify Certificate" screen
2. Choose your preferred method:
   - Tap "Scan with Camera" for live scanning
   - Tap "Upload QR Image" to select a saved image
   - Or manually type the certificate ID

### For Developers:
The implementation uses:
- `CameraView` from `expo-camera` for live scanning
- `ImagePicker` from `expo-image-picker` for image selection
- `jsQR` for decoding QR codes from images (web platform)

## Troubleshooting

### Permissions
If camera or gallery access fails:
- **iOS**: Check Settings → Intelligent Academic Credentialing → Camera & Photos
- **Android**: Check Settings → Apps → Intelligent Academic Credentialing → Permissions

### Dependencies
If you see module errors:
```bash
# Clear and reinstall
rm -rf node_modules
npm install
```

### Development Server
If changes don't appear:
```bash
# Clear cache and restart
npm start -- --clear
```

## Testing

Test these scenarios:
1. ✅ Camera opens and scans QR codes
2. ✅ Image picker opens and selects images
3. ✅ Web decodes QR from uploaded images
4. ✅ Manual entry still works
5. ✅ Permission prompts appear correctly
6. ✅ Loading states display during processing
