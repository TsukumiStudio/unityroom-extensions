// unityroom Extensions - Content Script

(function () {
  "use strict";

  const path = location.pathname;

  // ゲームページ: 評価値のコピー欄を追加
  if (/^\/games\/[^/]+$/.test(path)) {
    addEvaluationCopyBox();
  }

  // WebGLアップロードページ: フォルダ選択UIを追加
  if (/\/settings\/webgl_upload/.test(path)) {
    addFolderUploadUI();
  }

  // --- 評価値コピー機能 ---
  function addEvaluationCopyBox() {
    const canvas = document.querySelector(
      'canvas.chart-js[key="EvaluationChart"]'
    );
    if (!canvas) return;

    let chartData;
    try {
      chartData = JSON.parse(canvas.dataset.data);
    } catch {
      return;
    }

    const labels = chartData.labels;
    const dataset = chartData.datasets && chartData.datasets[0];
    if (!labels || !dataset || !dataset.data) return;

    const values = dataset.data;
    const evalCount = dataset.label || "";

    // 平均値を算出
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const avgRounded = Math.round(avg * 1000) / 1000;

    // テキスト生成
    const lines = labels.map((label, i) => `${label}: ${values[i]}`);
    lines.push(`平均: ${avgRounded}`);
    const text = lines.join("\n");

    // UIを作成
    const container = document.getElementById("evaluation-summary");
    if (!container) return;

    const box = document.createElement("div");
    box.className = "ure-eval-box";

    const pre = document.createElement("pre");
    pre.textContent = text;
    box.appendChild(pre);

    const copyBtn = document.createElement("button");
    copyBtn.className = "ure-eval-copy-btn";
    copyBtn.textContent = "コピー";
    copyBtn.addEventListener("click", () => copyToClipboard(text, copyBtn));
    box.appendChild(copyBtn);
    container.appendChild(box);
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = "コピーしました！";
      setTimeout(() => {
        btn.textContent = orig;
      }, 1500);
    });
  }

  // --- フォルダアップロード機能 ---
  function addFolderUploadUI() {
    const form = document.querySelector('form[id^="form_"]');
    if (!form) return;

    const box = document.createElement("div");
    box.className = "ure-folder-box";

    const desc = document.createElement("p");
    desc.textContent =
      "Buildフォルダをドラッグ＆ドロップ、またはクリックして選択";
    box.appendChild(desc);

    const folderInput = document.createElement("input");
    folderInput.type = "file";
    folderInput.webkitdirectory = true;
    folderInput.multiple = true;
    folderInput.style.display = "none";

    const result = document.createElement("div");
    result.className = "ure-folder-result";

    box.appendChild(folderInput);
    box.appendChild(result);

    // クリックでフォルダ選択
    box.addEventListener("click", (e) => {
      if (e.target === folderInput) return;
      folderInput.click();
    });

    // ドラッグ＆ドロップ
    box.addEventListener("dragover", (e) => {
      e.preventDefault();
      box.classList.add("ure-dragover");
    });

    box.addEventListener("dragleave", () => {
      box.classList.remove("ure-dragover");
    });

    box.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("ure-dragover");

      const items = Array.from(e.dataTransfer.items);
      const filePromises = [];

      for (const item of items) {
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry) {
          filePromises.push(readEntry(entry));
        }
      }

      Promise.all(filePromises).then((nested) => {
        assignFiles(nested.flat());
      });
    });

    form.parentNode.insertBefore(box, form);

    folderInput.addEventListener("change", () => {
      assignFiles(Array.from(folderInput.files));
    });

    // ドロップされたエントリからファイルを再帰的に読み取る
    function readEntry(entry) {
      return new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((f) => resolve([f]));
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries((entries) => {
            Promise.all(entries.map(readEntry)).then((nested) =>
              resolve(nested.flat())
            );
          });
        } else {
          resolve([]);
        }
      });
    }

    function assignFiles(files) {
      if (files.length === 0) return;

      const mapping = {
        loader_file: (name) => name.endsWith(".loader.js"),
        wasmframework_file: (name) => name.endsWith(".framework.js.gz"),
        data_file: (name) => name.endsWith(".data.gz"),
        wasmcode_file: (name) => name.endsWith(".wasm.gz"),
      };

      const matched = {};
      const messages = [];

      for (const [inputName, matcher] of Object.entries(mapping)) {
        const file = files.find((f) => matcher(f.name));
        if (file) {
          matched[inputName] = file;
        }
      }

      const matchedCount = Object.keys(matched).length;

      if (matchedCount === 0) {
        result.className = "ure-folder-result ure-error";
        result.textContent =
          "対象ファイルが見つかりませんでした。Buildフォルダを選択してください。";
        return;
      }

      for (const [inputName, file] of Object.entries(matched)) {
        const input = form.querySelector(`input[name="${inputName}"]`);
        if (!input) continue;

        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        messages.push(file.name);
      }

      result.className = "ure-folder-result ure-success";
      result.textContent = `${matchedCount}/4 ファイルをセットしました: ${messages.join(", ")}`;
    }
  }
})();
