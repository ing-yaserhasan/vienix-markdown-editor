const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'js', 'rtlmd.js');
let code = fs.readFileSync(filePath, 'utf8');

// The main IIFE ends right before the floating dock:
// Locate:
//   window.closeEmojiPicker();
//   showToast(`تم إدراج أيقونة ${iconItem.name} ✓`, 'success');
// };
// })();
// /* ============================================================
//    نظام السحب والإفلات للوحة الأدوات العائمة

const mainIifeEndMarker = 'showToast(`تم إدراج أيقونة ${iconItem.name} ✓`, \'success\');\r\n  };\r\n\r\n})();';
const mainIifeEndMarkerLF = 'showToast(`تم إدراج أيقونة ${iconItem.name} ✓`, \'success\');\n  };\n\n})();';

const hasCRLF = code.includes(mainIifeEndMarker);
const marker = hasCRLF ? mainIifeEndMarker : mainIifeEndMarkerLF;

if (!code.includes(marker)) {
  console.error('Main IIFE end marker not found!');
  process.exit(1);
}

// Locate settings and pronunciation block starting after initFloatingDockDrag
const settingsStartMarker = '// ==========================================================================\r\n  // SETTINGS MODAL UI CONTROLLERS';
const settingsStartMarkerLF = '// ==========================================================================\n  // SETTINGS MODAL UI CONTROLLERS';
const sMarker = code.includes(settingsStartMarker) ? settingsStartMarker : settingsStartMarkerLF;

const sIdx = code.indexOf(sMarker);
if (sIdx === -1) {
  console.error('Settings block marker not found!');
  process.exit(1);
}

// The block to move is from sIdx to the end of the file (trimming trailing })(); )
let trailingBlock = code.substring(sIdx);
// Remove trailing })();\n\n if present
trailingBlock = trailingBlock.replace(/\r?\n\s*\r?\n\}\)\(\);\s*$/, '');
// Also remove duplicate loadSettings() and applyAllSettings() from trailingBlock startup
trailingBlock = trailingBlock.replace(/loadSettings\(\);\r?\n\s*applyAllSettings\(\);\r?\n/, '');

// Remove trailingBlock from code
code = code.substring(0, sIdx).trimEnd();

// Now insert trailingBlock INSIDE the main IIFE right before })();
const replacement = `showToast(\`تم إدراج أيقونة \${iconItem.name} ✓\`, 'success');
  };

  // ==========================================================================
  // INJECTED INSIDE MAIN IIFE: PRONUNCIATION & SETTINGS CONTROLLERS
  // ==========================================================================

${trailingBlock}

})();`;

code = code.replace(marker, replacement);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully moved Settings and Pronunciation engine inside main IIFE!');
