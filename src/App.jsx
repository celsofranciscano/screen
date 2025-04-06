"use client";
import "./App.css";

import { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Monitor,
  Video,
  StopCircle,
  Download,
  Volume2,
  VolumeX,
  AlertCircle,
  Loader2,
  Check,
  ChevronDown,
  Github,
  Globe,
  User,
  Settings,
  Clock,
} from "lucide-react";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [error, setError] = useState(null);
  const [environmentWarning, setEnvironmentWarning] = useState(false);
  const [processingRecording, setProcessingRecording] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showFpsMenu, setShowFpsMenu] = useState(false);

  // Opciones de calidad

  const [videoQuality, setVideoQuality] = useState("alta"); // "baja" | "media" | "alta" | "ultra"
  const [fps, setFps] = useState("30"); // "30" | "60"

  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedBlobRef = useRef(null);
  const downloadUrlRef = useRef(null);

  // Configuraciones de calidad
  const qualitySettings = {
    baja: {
      width: 854,
      height: 480,
      bitrate: 1000000, // 1 Mbps
    },
    media: {
      width: 1280,
      height: 720,
      bitrate: 2500000, // 2.5 Mbps
    },
    alta: {
      width: 1920,
      height: 1080,
      bitrate: 5000000, // 5 Mbps
    },
    ultra: {
      width: 3840,
      height: 2160,
      bitrate: 12000000, // 12 Mbps
    },
  };

  const qualityLabels = {
    baja: "Baja (480p)",
    media: "Media (720p)",
    alta: "Alta (1080p)",
    ultra: "Ultra (4K)",
  };

  // Verificar el entorno al cargar
  useEffect(() => {
    const checkEnvironment = async () => {
      try {
        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getDisplayMedia
        ) {
          setEnvironmentWarning(true);
        }
      } catch (err) {
        setEnvironmentWarning(true);
      }
    };

    checkEnvironment();

    // Generar nombre de archivo por defecto
    const now = new Date();
    const formattedDate = now.toLocaleDateString("es-ES").replace(/\//g, "-");
    const formattedTime = now.toLocaleTimeString("es-ES").replace(/:/g, "-");
    setRecordingName(`grabacion-pantalla-${formattedDate}-${formattedTime}`);

    // Limpiar al desmontar
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setRecordingReady(false);
      downloadUrlRef.current = null;
      recordedChunksRef.current = [];

      // Comprobar si estamos en un entorno de vista previa
      if (environmentWarning) {
        throw new Error(
          "La grabación de pantalla no está disponible en este entorno de vista previa. Por favor, despliega la aplicación para usar esta función."
        );
      }

      console.log("Solicitando acceso a la pantalla...");

      // Obtener stream de pantalla
      let screenStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
            width: { ideal: qualitySettings[videoQuality].width },
            height: { ideal: qualitySettings[videoQuality].height },
            frameRate: { ideal: Number.parseInt(fps) },
          },
          audio: systemAudioEnabled,
        });
        console.log(
          "Stream de pantalla obtenido:",
          screenStream
            .getTracks()
            .map((t) => t.kind)
            .join(", ")
        );
      } catch (err) {
        console.error("Error al obtener stream de pantalla:", err);
        throw new Error(
          "No se pudo acceder a la pantalla. Asegúrate de dar permiso cuando se te solicite."
        );
      }

      // Obtener stream de micrófono si está habilitado
      let micStream = null;
      if (micEnabled) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          console.log("Stream de micrófono obtenido");
        } catch (err) {
          console.error("Error al acceder al micrófono:", err);
          setError(
            "No se pudo acceder al micrófono. La grabación continuará sin audio del micrófono."
          );
        }
      }

      // Crear un AudioContext para mezclar los streams de audio
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Añadir audio del sistema si está disponible
      const systemAudioTracks = screenStream.getAudioTracks();
      if (systemAudioTracks.length > 0 && systemAudioEnabled) {
        const systemSource = audioContext.createMediaStreamSource(
          new MediaStream([systemAudioTracks[0]])
        );
        systemSource.connect(destination);
      }

      // Añadir audio del micrófono si está disponible
      if (micStream && micEnabled) {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
      }

      // Crear stream final con video de pantalla y audio combinado
      const finalStream = new MediaStream();

      // Añadir pistas de video de la pantalla
      screenStream.getVideoTracks().forEach((track) => {
        finalStream.addTrack(track);
      });

      // Añadir pistas de audio combinadas
      destination.stream.getAudioTracks().forEach((track) => {
        finalStream.addTrack(track);
      });

      console.log(
        "Stream combinado creado con pistas:",
        finalStream
          .getTracks()
          .map((t) => t.kind)
          .join(", ")
      );

      // Encontrar un formato compatible
      let mimeType = "video/webm";
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
        mimeType = "video/webm;codecs=vp9,opus";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
        mimeType = "video/webm;codecs=vp8,opus";
      }
      console.log("Usando formato:", mimeType);

      // Crear grabador de medios
      const mediaRecorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: qualitySettings[videoQuality].bitrate,
      });

      mediaRecorderRef.current = mediaRecorder;

      // Manejar datos disponibles
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          console.log(`Chunk recibido: ${event.data.size} bytes`);
          recordedChunksRef.current.push(event.data);
        }
      };

      // Manejar detención de grabación
      mediaRecorder.onstop = async () => {
        console.log("Grabación detenida, procesando...");
        setProcessingRecording(true);

        try {
          // Detener todas las pistas
          finalStream.getTracks().forEach((track) => track.stop());
          if (micStream) {
            micStream.getTracks().forEach((track) => track.stop());
          }

          // Crear blob a partir de fragmentos grabados
          console.log(
            `Creando blob a partir de ${recordedChunksRef.current.length} chunks`
          );
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          console.log(`Blob creado: ${blob.size} bytes, tipo: ${blob.type}`);

          // Guardar blob para descarga
          recordedBlobRef.current = blob;

          // Crear URL para el blob
          const url = URL.createObjectURL(blob);
          console.log("URL del blob creada:", url);
          downloadUrlRef.current = url;

          setRecordingReady(true);
        } catch (err) {
          console.error("Error al procesar la grabación:", err);
          setError(
            "Error al procesar el video. Por favor, intenta nuevamente."
          );
        } finally {
          setProcessingRecording(false);
        }
      };

      // Iniciar grabación
      console.log("Iniciando grabación...");
      mediaRecorder.start(1000); // Recopilar datos cada segundo
      setIsRecording(true);
      setIsLoading(false);

      // Iniciar temporizador
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error al iniciar la grabación:", err);

      if (
        err.message &&
        err.message.includes("disallowed by permission policy")
      ) {
        setError(
          "La grabación de pantalla no está disponible en este entorno de vista previa. Por favor, despliega la aplicación para usar esta función."
        );
        setEnvironmentWarning(true);
      } else {
        setError(
          err.message ||
            "No se pudo iniciar la grabación. Asegúrate de haber concedido los permisos necesarios."
        );
      }

      setIsLoading(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log("Deteniendo grabación...");
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const downloadRecording = () => {
    if (recordedBlobRef.current && downloadUrlRef.current) {
      console.log("Descargando grabación...");
      const a = document.createElement("a");
      a.href = downloadUrlRef.current;
      a.download = `${recordingName}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleRecordingNameChange = (e) => {
    setRecordingName(e.target.value);
  };

  const resetRecording = () => {
    setRecordingReady(false);
    setRecordingTime(0);
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];

    // Generar nuevo nombre de archivo
    const now = new Date();
    const formattedDate = now.toLocaleDateString("es-ES").replace(/\//g, "-");
    const formattedTime = now.toLocaleTimeString("es-ES").replace(/:/g, "-");
    setRecordingName(`grabacion-pantalla-${formattedDate}-${formattedTime}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-[#1a0a0a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header con logo y título */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-red-800 rounded-md flex items-center justify-center shadow-lg shadow-red-900/20">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                Grabador de Pantalla
              </h1>
              <p className="text-gray-400 text-sm">
                Captura tu pantalla con audio
              </p>
            </div>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 bg-red-900/30 backdrop-blur-sm px-4 py-2 rounded-md text-sm font-medium border border-red-800/30 shadow-lg shadow-red-900/10">
              <div className="w-2 h-2 rounded-md bg-red-500 animate-pulse"></div>
              <span className="text-red-200">{formatTime(recordingTime)}</span>
            </div>
          )}
        </div>

        {/* Alertas */}
        {environmentWarning && (
          <div className="mb-8 bg-amber-900/10 border border-amber-800/30 text-amber-200 px-5 py-4 rounded-md flex items-start gap-3 text-sm backdrop-blur-sm shadow-lg shadow-amber-900/5">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Limitación del entorno de vista previa
              </p>
              <p className="mt-1">
                La grabación de pantalla requiere permisos que no están
                disponibles en este entorno de vista previa. Para usar esta
                función, por favor despliega la aplicación en tu propio dominio.
              </p>
            </div>
          </div>
        )}

        {error && !environmentWarning && (
          <div className="mb-8 bg-red-900/10 border border-red-800/30 text-red-200 px-5 py-4 rounded-md text-sm backdrop-blur-sm shadow-lg shadow-red-900/5">
            {error}
          </div>
        )}

        {/* Contenido principal */}
        <div className="relative">
          {/* Pantalla de configuración */}
          {!isRecording && !recordingReady && !processingRecording && (
            <div className="bg-gradient-to-br from-[#2a0e0e] to-[#1e0e14] rounded-md p-4 border border-red-900/20 shadow-xl shadow-red-900/10 backdrop-blur-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Sección de fuentes de audio */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-600/20 to-red-800/20 rounded-md flex items-center justify-center">
                      <Volume2 className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">
                      Fuentes de audio
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      className={`flex items-center gap-3 px-5 py-4 rounded-md border transition-all duration-300 ${
                        micEnabled
                          ? "bg-gradient-to-br from-red-900/30 to-red-800/30 border-red-700/30 text-white"
                          : "bg-[#1a1117] border-gray-800 text-gray-400 hover:bg-[#231419] hover:border-gray-700"
                      }`}
                      onClick={() => setMicEnabled(!micEnabled)}
                    >
                      <div
                        className={`w-10 h-10 rounded-md flex items-center justify-center ${
                          micEnabled ? "bg-red-800/30" : "bg-gray-800/30"
                        }`}
                      >
                        {micEnabled ? (
                          <Mic className="w-5 h-5" />
                        ) : (
                          <MicOff className="w-5 h-5" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Micrófono</div>
                        <div className="text-xs opacity-70">
                          {micEnabled ? "Activado" : "Desactivado"}
                        </div>
                      </div>
                    </button>

                    <button
                      className={`flex items-center gap-3 px-5 py-4 rounded-md border transition-all duration-300 ${
                        systemAudioEnabled
                          ? "bg-gradient-to-br from-red-900/30 to-red-800/30 border-red-700/30 text-white"
                          : "bg-[#1a1117] border-gray-800 text-gray-400 hover:bg-[#231419] hover:border-gray-700"
                      }`}
                      onClick={() => setSystemAudioEnabled(!systemAudioEnabled)}
                    >
                      <div
                        className={`w-10 h-10 rounded-md flex items-center justify-center ${
                          systemAudioEnabled
                            ? "bg-red-800/30"
                            : "bg-gray-800/30"
                        }`}
                      >
                        {systemAudioEnabled ? (
                          <Volume2 className="w-5 h-5" />
                        ) : (
                          <VolumeX className="w-5 h-5" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Audio del sistema</div>
                        <div className="text-xs opacity-70">
                          {systemAudioEnabled ? "Activado" : "Desactivado"}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Sección de calidad de video */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-600/20 to-red-800/20 rounded-md flex items-center justify-center">
                      <Settings className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">
                      Calidad de video
                    </h3>
                  </div>

                  <div className="space-y-5">
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Resolución
                      </label>
                      <button
                        className="flex items-center justify-between gap-2 px-5 py-4 rounded-md border border-gray-800 bg-[#1a1117] text-white w-full hover:bg-[#231419] hover:border-gray-700 transition-all duration-300"
                        onClick={() => setShowQualityMenu(!showQualityMenu)}
                      >
                        <span>{qualityLabels[videoQuality]}</span>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      </button>

                      {showQualityMenu && (
                        <div className="absolute top-full left-0 mt-2 w-full bg-[#1a1117] border border-gray-800 rounded-md shadow-2xl z-10 overflow-hidden">
                          {Object.keys(qualityLabels).map((quality) => (
                            <button
                              key={quality}
                              className="flex items-center justify-between w-full px-5 py-4 hover:bg-[#231419] text-left border-b border-gray-800 last:border-0"
                              onClick={() => {
                                setVideoQuality(quality);
                                setShowQualityMenu(false);
                              }}
                            >
                              <span>{qualityLabels[quality]}</span>
                              {videoQuality === quality && (
                                <Check className="w-5 h-5 text-red-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Fotogramas por segundo
                      </label>
                      <button
                        className="flex items-center justify-between gap-2 px-5 py-4 rounded-md border border-gray-800 bg-[#1a1117] text-white w-full hover:bg-[#231419] hover:border-gray-700 transition-all duration-300"
                        onClick={() => setShowFpsMenu(!showFpsMenu)}
                      >
                        <span>{fps} FPS</span>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      </button>

                      {showFpsMenu && (
                        <div className="absolute top-full left-0 mt-2 w-full bg-[#1a1117] border border-gray-800 rounded-md shadow-2xl z-10 overflow-hidden">
                          {["30", "60"].map((fpsOption) => (
                            <button
                              key={fpsOption}
                              className="flex items-center justify-between w-full px-5 py-4 hover:bg-[#231419] text-left border-b border-gray-800 last:border-0"
                              onClick={() => {
                                setFps(fpsOption, "30" | "60");
                                setShowFpsMenu(false);
                              }}
                            >
                              <span>{fpsOption} FPS</span>
                              {fps === fpsOption && (
                                <Check className="w-5 h-5 text-red-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón de iniciar grabación */}
              <div className="mt-10 flex justify-center">
                <button
                  onClick={startRecording}
                  disabled={isLoading || environmentWarning}
                  className="flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium px-8 py-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-red-900/30 min-w-[200px]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Preparando...</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-5 h-5" />
                      <span>Iniciar grabación</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Pantalla de grabación en curso */}
          {isRecording && (
            <div className="bg-gradient-to-br from-[#2a0e0e] to-[#1e0e14] rounded-md p-4 border border-red-900/20 shadow-xl shadow-red-900/10 backdrop-blur-sm text-center">
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-24 h-24 rounded-md bg-red-900/20 flex items-center justify-center mb-6 relative">
                  <div className="w-20 h-20 rounded-md bg-red-800/30 flex items-center justify-center animate-pulse">
                    <Video className="w-10 h-10 text-red-300" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 rounded-md flex items-center justify-center">
                    <div className="w-3 h-3 rounded-md bg-white animate-pulse"></div>
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">
                  Grabando pantalla
                </h2>
                <p className="text-gray-400 mb-6">Capturando audio y video</p>

                <div className="flex items-center gap-6 mb-8">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-red-400" />
                    <span className="text-xl font-semibold">
                      {formatTime(recordingTime)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-red-400" />
                    <span className="text-xl font-semibold">
                      {qualityLabels[videoQuality]}
                    </span>
                  </div>
                </div>

                <button
                  onClick={stopRecording}
                  className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-8 py-4 rounded-md transition-all duration-300 shadow-lg shadow-red-900/30"
                >
                  <StopCircle className="w-5 h-5" />
                  <span>Detener grabación</span>
                </button>
              </div>
            </div>
          )}

          {/* Pantalla de procesamiento */}
          {processingRecording && (
            <div className="bg-gradient-to-br from-[#2a0e0e] to-[#1e0e14] rounded-md p-4 border border-red-900/20 shadow-xl shadow-red-900/10 backdrop-blur-sm">
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-20 h-20 relative mb-8">
                  <div className="absolute inset-0 rounded-md border-4 border-red-800/30"></div>
                  <div className="absolute inset-0 rounded-md border-4 border-red-500 border-t-transparent animate-spin"></div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">
                  Procesando grabación
                </h2>
                <p className="text-gray-400">Esto puede tomar unos segundos</p>
              </div>
            </div>
          )}

          {/* Pantalla de grabación completada */}
          {recordingReady && !isRecording && !processingRecording && (
            <div className="bg-gradient-to-br from-[#2a0e0e] to-[#1e0e14] rounded-md p-4 border border-red-900/20 shadow-xl shadow-red-900/10 backdrop-blur-sm">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-600/20 to-red-800/20 rounded-md flex items-center justify-center">
                      <Monitor className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">
                      Grabación completada
                    </h3>
                  </div>

                  <div className="bg-[#1a1117] rounded-md p-4 border border-gray-800">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-16 h-16 bg-red-900/20 rounded-md flex items-center justify-center">
                        <Video className="w-8 h-8 text-red-400" />
                      </div>
                      <div>
                        <h4 className="text-lg font-medium text-white">
                          Video grabado
                        </h4>
                        <p className="text-gray-400 text-sm">
                          Listo para descargar
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Duración</span>
                        <span className="text-white font-medium">
                          {formatTime(recordingTime)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Calidad</span>
                        <span className="text-white font-medium">
                          {qualityLabels[videoQuality]}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">FPS</span>
                        <span className="text-white font-medium">
                          {fps} FPS
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Audio</span>
                        <span className="text-white font-medium">
                          {micEnabled && systemAudioEnabled
                            ? "Micrófono y sistema"
                            : micEnabled
                            ? "Solo micrófono"
                            : systemAudioEnabled
                            ? "Solo sistema"
                            : "Sin audio"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-600/20 to-red-800/20 rounded-md flex items-center justify-center">
                      <Download className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">
                      Guardar grabación
                    </h3>
                  </div>

                  <div className="bg-[#1a1117] rounded-md p-4 border border-gray-800">
                    <div className="mb-4">
                      <label
                        htmlFor="recording-name"
                        className="block text-sm font-medium text-gray-300 mb-2"
                      >
                        Nombre del archivo
                      </label>
                      <input
                        id="recording-name"
                        type="text"
                        value={recordingName}
                        onChange={handleRecordingNameChange}
                        className="w-full px-4 py-3 border border-gray-700 rounded-md bg-[#231419] text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-300"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mt-6">
                      <button
                        onClick={resetRecording}
                        className="flex items-center justify-center gap-2 border border-gray-700 bg-[#231419] hover:bg-[#2a1820] text-gray-300 font-medium px-5 py-3 rounded-md transition-all duration-300 flex-1"
                      >
                        Nueva grabación
                      </button>

                      <button
                        onClick={downloadRecording}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium px-5 py-3 rounded-md transition-all duration-300 shadow-lg shadow-red-900/30 flex-1"
                      >
                        <Download className="w-5 h-5" />
                        Descargar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-red-900/20 pt-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
            <a
              href="https://github.com/celsofranciscano"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-red-400 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>celsofranciscano</span>
            </a>
            <a
              href="https://celso.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-red-400 transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>celso.pages.dev</span>
            </a>
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              <span>Celso Franciscano</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
