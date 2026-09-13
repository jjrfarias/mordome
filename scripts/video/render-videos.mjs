import path from "node:path";
import process from "node:process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ffmpeg = path.resolve(".tools", "ffmpeg", "bin", "ffmpeg.exe");
const ffprobe = path.resolve(".tools", "ffmpeg", "bin", "ffprobe.exe");
const root = path.resolve("artifacts", "videos");

const P = (variant, group, file) => path.join(root, variant, group, file);
const plans = {
  saas: {
    output: "Mordome-SaaS-apresentacao.mp4",
    scenes: [
      { duration:15, visuals:[["raw","01-abertura-restaurante.mp4",4],["cards","00-marca.png",11]] },
      { duration:12, visuals:[["cards","01-primeiro-acesso.png",7],["stills","01-login.png",10]] },
      { duration:13, visuals:[["cards","02-multiunidade.png",7],["stills","12-estabelecimentos.png",9]] },
      { duration:15, visuals:[["stills","03-pdv.png",17]] },
      { duration:15, visuals:[["stills","02-salao.png",17]] },
      { duration:13, visuals:[["stills","04-cozinha.png",16]] },
      { duration:12, visuals:[["cards","03-canais.png",8],["stills","14-integracoes.png",9]] },
      { duration:15, visuals:[["stills","11-fichas-tecnicas.png",9],["stills","10-estoque.png",8]] },
      { duration:10, visuals:[["stills","10-estoque.png",7],["stills","12-estabelecimentos.png",8]] },
      { duration:13, visuals:[["stills","05-caixa.png",7],["cards","04-financeiro.png",6]] },
      { duration:16, visuals:[["cards","05-offline-local.png",4],["cards","06-offline-sync.png",5],["cards","07-offline-ok.png",4]] },
      { duration:14, visuals:[["stills","06-resumo.png",2],["stills","07-historico.png",2],["cards","99-encerramento.png",3]] },
    ],
  },
  betao: {
    output: "Mordome-Familia-Betao.mp4",
    scenes: [
      { duration:6.5, visuals:[["raw","01-abertura-hotdog.mp4",4],["cards","00-marca.png",4]] },
      { duration:8, visuals:[["stills","01-login.png",9]] },
      { duration:9.5, visuals:[["stills","03-pdv.png",10]] },
      { duration:8.5, visuals:[["stills","02-salao.png",5],["stills","04-cozinha.png",4]] },
      { duration:7.5, visuals:[["stills","09-cardapio.png",4],["cards","01-canais.png",5]] },
      { duration:9.5, visuals:[["cards","02-offline.png",8]] },
      { duration:8, visuals:[["cards","99-encerramento.png",7]] },
    ],
  },
};

function run(bin, args) {
  const result = spawnSync(bin, ["-hide_banner","-loglevel","error",...args], { encoding:"utf8", windowsHide:true, maxBuffer:16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Falha ao executar ${path.basename(bin)} (${result.status}).\n${result.stderr || result.stdout}`);
}

function durationOf(file) {
  const result = spawnSync(ffprobe, ["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",file], { encoding:"utf8", windowsHide:true });
  if (result.status !== 0) throw new Error(`Não foi possível ler a duração de ${file}.`);
  return Number(result.stdout.trim());
}

function concatLine(file) {
  return `file '${file.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
}

for (const [variant, plan] of Object.entries(plans)) {
  if (process.env.VIDEO_VARIANT && process.env.VIDEO_VARIANT !== variant) continue;
  const temp = path.join(root, variant, "render-temp");
  await rm(temp, { recursive:true, force:true });
  await mkdir(temp, { recursive:true });
  const visualParts = [];
  const audioParts = [];
  let visualIndex = 0;

  for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex++) {
    const scene = plan.scenes[sceneIndex];
    const visualWeight = scene.visuals.reduce((sum, visual) => sum + visual[2], 0);
    let allocatedVisualTime = 0;
    for (let sceneVisualIndex = 0; sceneVisualIndex < scene.visuals.length; sceneVisualIndex++) {
      const [group, file, weight] = scene.visuals[sceneVisualIndex];
      const length = sceneVisualIndex === scene.visuals.length - 1
        ? scene.duration - allocatedVisualTime
        : Number((scene.duration * weight / visualWeight).toFixed(3));
      allocatedVisualTime += length;
      visualIndex++;
      const input = P(variant, group, file);
      const output = path.join(temp, `visual-${String(visualIndex).padStart(2,"0")}.mp4`);
      const isVideo = file.endsWith(".mp4");
      const inputArgs = isVideo ? ["-stream_loop","-1","-i",input] : ["-loop","1","-i",input];
      const fadeOut = Math.max(0, length - 0.28).toFixed(2);
      run(ffmpeg, ["-y",...inputArgs,"-t",String(length),"-vf",`scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fade=t=in:st=0:d=0.28,fade=t=out:st=${fadeOut}:d=0.28,format=yuv420p`,"-an","-r","30","-c:v","libx264","-preset","veryfast","-crf","21",output]);
      visualParts.push(output);
    }

    const narration = P(variant, "narration", `${String(sceneIndex + 1).padStart(2,"0")}.wav`);
    const rawDuration = durationOf(narration);
    const available = scene.duration - 0.55;
    const tempo = Math.max(1, rawDuration / available);
    const audioOutput = path.join(temp, `audio-${String(sceneIndex + 1).padStart(2,"0")}.wav`);
    const fadeStart = Math.max(0, scene.duration - 0.22).toFixed(2);
    run(ffmpeg, ["-y","-i",narration,"-af",`atempo=${tempo.toFixed(4)},adelay=250|250,apad,atrim=0:${scene.duration},afade=t=out:st=${fadeStart}:d=0.2`,"-ar","48000","-ac","2",audioOutput]);
    audioParts.push(audioOutput);
  }

  const videoList = path.join(temp, "video-list.txt");
  const audioList = path.join(temp, "audio-list.txt");
  await writeFile(videoList, `${visualParts.map(concatLine).join("\n")}\n`, "utf8");
  await writeFile(audioList, `${audioParts.map(concatLine).join("\n")}\n`, "utf8");
  const silentVideo = path.join(temp, "silent.mp4");
  const narrationTrack = path.join(temp, "narration.wav");
  run(ffmpeg, ["-y","-f","concat","-safe","0","-i",videoList,"-c","copy",silentVideo]);
  run(ffmpeg, ["-y","-f","concat","-safe","0","-i",audioList,"-c","copy",narrationTrack]);

  const output = path.join(root, variant, plan.output);
  run(ffmpeg, ["-y","-i",silentVideo,"-i",narrationTrack,"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",output]);
  process.stdout.write(`FINAL ${output} (${durationOf(output).toFixed(2)}s)\n`);
  await rm(temp, { recursive:true, force:true });
}
