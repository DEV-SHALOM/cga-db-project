import { useState, useEffect } from "react";
import { FaUpload, FaFilePdf, FaFileWord, FaFileVideo, FaFileImage, FaFileAlt, FaTrash, FaDownload } from "react-icons/fa";
import { motion } from "framer-motion";
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { v4 as uuidv4 } from "uuid";

function Notification({ message }) {
  return (
    <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-8 py-3 rounded-xl shadow-2xl z-[9999] animate-pop-in">
      {message}
    </div>
  );
}

export default function DocumentStorage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const categories = ["All", "PDF", "Documents", "Videos", "Images", "Others"];

  // File type detection
  const getFileType = (fileName) => {
    const extension = fileName.split(".").pop().toLowerCase();
    
    if (["pdf"].includes(extension)) return "PDF";
    if (["doc", "docx", "txt", "rtf"].includes(extension)) return "Documents";
    if (["mp4", "mov", "avi", "mkv"].includes(extension)) return "Videos";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) return "Images";
    return "Others";
  };

  // File icon component
  const FileIcon = ({ type }) => {
    switch(type) {
      case "PDF": return <FaFilePdf className="text-red-500 text-2xl" />;
      case "Documents": return <FaFileWord className="text-blue-500 text-2xl" />;
      case "Videos": return <FaFileVideo className="text-purple-500 text-2xl" />;
      case "Images": return <FaFileImage className="text-green-500 text-2xl" />;
      default: return <FaFileAlt className="text-gray-500 text-2xl" />;
    }
  };

  // Enhanced fetch with retry logic
  const fetchFilesWithRetry = async (retryCount = 0) => {
    try {
      const storageRef = ref(storage, "documents/");
      const res = await listAll(storageRef);
      
      const filesData = await Promise.all(
        res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          return {
            name: itemRef.name,
            url,
            type: getFileType(itemRef.name),
            size: (itemRef.size / (1024 * 1024)).toFixed(2) + " MB",
            uploadedAt: new Date(itemRef.timeCreated).toLocaleDateString(),
            ref: itemRef
          };
        })
      );
      
      setFiles(filesData);
    } catch (err) {
      if (retryCount < 3) {
        console.log(`Retrying... Attempt ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return fetchFilesWithRetry(retryCount + 1);
      }
      setNotification("Error fetching files: " + err.message);
      console.error("Final fetch error:", err);
    }
  };

  useEffect(() => {
    fetchFilesWithRetry();
  }, []);

  // Enhanced upload with timeout
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    
    try {
      const fileType = getFileType(file.name);
      const fileId = uuidv4();
      const fileName = `${fileId}-${file.name}`;
      const storageRef = ref(storage, `documents/${fileName}`);
      
      // Add timeout to upload
      const uploadTask = uploadBytes(storageRef, file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Upload timeout exceeded")), 30000)
      );

      await Promise.race([uploadTask, timeoutPromise]);
      const url = await getDownloadURL(storageRef);

      setFiles(prev => [...prev, {
        name: file.name,
        url,
        type: fileType,
        size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        uploadedAt: new Date().toLocaleDateString(),
        ref: storageRef
      }]);

    } catch (err) {
      console.error("Upload error:", err);
      setNotification("Upload failed: " + (err.message || "Please check your connection"));
    } finally {
      setUploading(false);
    }
  };

  // Handle file deletion
  const handleDelete = async (fileRef) => {
    try {
      await deleteObject(fileRef);
      setFiles(prev => prev.filter(file => file.ref !== fileRef));
    } catch (err) {
      setNotification("Error deleting file: " + err.message);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  // Filter files based on category and search term
  const filteredFiles = files.filter(file => {
    const matchesCategory = selectedCategory === "All" || file.type === selectedCategory;
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24 relative"
    >
      {notification && <Notification message={notification} />}
      
      <div className="max-w-7xl mx-auto font-[Poppins]">
        <motion.h2
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="font-extrabold text-4xl sm:text-5xl text-white mb-10 text-center drop-shadow-lg tracking-wide"
        >
          Document Storage
        </motion.h2>

        {/* Upload and Filter Section */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-8 bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-md"
        >
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Upload Button */}
            <label className="w-full md:w-auto">
              <div className="flex items-center justify-center gap-2 bg-gradient-to-tr from-[#8055f7] to-[#5b37d1] text-white px-6 py-3 rounded-lg cursor-pointer hover:opacity-90 transition-opacity">
                <FaUpload />
                <span>{uploading ? "Uploading..." : "Upload Document"}</span>
                <input 
                  type="file" 
                  onChange={handleUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </div>
            </label>

            {/* Search Input */}
            <div className="w-full md:w-64">
              <input
                type="text"
                placeholder="Search documents..."
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[#8055f7]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Category Filter */}
            <div className="w-full md:w-auto">
              <select
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8055f7]"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Files List */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="rounded-2xl bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl shadow-2xl border border-white/30 p-6"
        >
          {/* Desktop View */}
          <div className="hidden md:block">
            <table className="w-full text-sm md:text-base rounded-xl">
              <thead>
                <tr className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90 backdrop-blur-sm">
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-left">Uploaded</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredFiles.length > 0 ? (
                  filteredFiles.map((file, index) => (
                    <tr key={index} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <FileIcon type={file.type} />
                      </td>
                      <td className="px-4 py-3 text-white max-w-xs truncate">
                        {file.name}
                      </td>
                      <td className="px-4 py-3 text-white/80">{file.size}</td>
                      <td className="px-4 py-3 text-white/80">{file.uploadedAt}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
                            title="Download"
                          >
                            <FaDownload size={14} />
                          </a>
                          <button
                            onClick={() => handleDelete(file.ref)}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                            title="Delete"
                          >
                            <FaTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-white/70">
                      No documents found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-3">
            {filteredFiles.length > 0 ? (
              filteredFiles.map((file, index) => (
                <div key={index} className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <FileIcon type={file.type} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-white truncate">{file.name}</h3>
                      <div className="flex justify-between text-sm text-white/60 mt-1">
                        <span>{file.size}</span>
                        <span>{file.uploadedAt}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <a 
                      href={file.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 flex items-center gap-1"
                    >
                      <FaDownload size={12} />
                      <span>Download</span>
                    </a>
                    <button
                      onClick={() => handleDelete(file.ref)}
                      className="px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center gap-1"
                    >
                      <FaTrash size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-white/70">
                No documents found
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}