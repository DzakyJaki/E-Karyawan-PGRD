import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../../../core/theme';

interface TutorialTopic {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  shortDesc: string;
  route: string;
  routeLabel: string;
  guideText: string;
}

interface Message {
  id: string;
  type: 'user' | 'bot';
  text: string;
  time: string;
  topicRoute?: string;
  topicRouteLabel?: string;
}

const TUTORIAL_TOPICS: TutorialTopic[] = [
  {
    id: 'cuti',
    icon: 'beach-access',
    title: 'Pengajuan Cuti',
    shortDesc: 'Panduan formulir, jenis cuti & upload lampiran',
    route: '/(tabs)/leave',
    routeLabel: 'Buka Halaman Cuti',
    guideText: `📋 PANDUAN PENGAJUAN CUTI:\n\n1️⃣ Masuk ke menu "Cuti" dari navigasi bawah.\n2️⃣ Tekan tombol "+ Ajukan Cuti Baru".\n3️⃣ Pilih jenis cuti yang sesuai (Cuti Tahunan, Cuti Sakit, dll).\n4️⃣ Jika jenis cuti mewajibkan berkas (misal Cuti Sakit), bagian upload lampiran gambar/PDF akan otomatis ditampilkan.\n5️⃣ Tentukan tanggal mulai, tanggal selesai, dan alasan cuti.\n6️⃣ Tekan "Kirim Pengajuan" dan pantau status persetujuan atasan pada riwayat cuti.`
  },
  {
    id: 'presensi',
    icon: 'fingerprint',
    title: 'Presensi & Absensi GPS',
    shortDesc: 'Cara Clock In/Out & verifikasi radius cabang',
    route: '/(tabs)/attendance',
    routeLabel: 'Buka Halaman Presensi',
    guideText: `📍 PANDUAN PRESENSI GPS:\n\n1️⃣ Aktifkan GPS pada smartphone Anda dan izinkan akses lokasi.\n2️⃣ Masuk ke menu "Presensi" dari tombol tengah navigasi.\n3️⃣ Aplikasi akan memeriksa koordinat posisi Anda terhadap radius kantor cabang.\n4️⃣ Tekan "Clock In (Masuk)" saat mulai bertugas, atau "Clock Out (Pulang)" saat selesai jam kerja.\n5️⃣ Data jam masuk, jam pulang, dan status keterlambatan tersinkronisasi otomatis ke sistem HRD.`
  },
  {
    id: 'pengajuan_presensi',
    icon: 'history-toggle-off',
    title: 'Form Pengajuan Presensi',
    shortDesc: 'Klarifikasi telat masuk, masuk istirahat & pulang cepat',
    route: '/(tabs)/profile/late-explanation',
    routeLabel: 'Buka Form Pengajuan Presensi',
    guideText: `📝 PANDUAN FORM PENGAJUAN PRESENSI:\n\n1️⃣ Masuk ke menu "Profil" lalu pilih "Form Pengajuan Presensi".\n2️⃣ Pilih tanggal presensi yang mengalami kendala keterlambatan atau pulang cepat.\n3️⃣ Ketentuan Batas Waktu Pengajuan:\n   • Pengajuan mandiri hanya berlaku maksimal 3 hari setelah tanggal presensi.\n   • Jika keterlambatan > 3 hari, sistem otomatis menyarankan untuk langsung menghubungi bagian Personalia/HRD.\n4️⃣ Jenis keterlambatan otomatis terdeteksi (Masuk, Masuk Istirahat, atau Pulang Cepat).\n5️⃣ Masukkan alasan secara jujur & jelas serta lampirkan foto bukti jika diperlukan.\n6️⃣ Tekan "Kirim Form Pengajuan Presensi".\n7️⃣ Pantau status persetujuan pada tab "Riwayat Pengajuan":\n   • Disetujui: Telat masuk disetujui personelia (tidak dipotong gaji).\n   • Ditolak: Tersedia 1x kesempatan perbaikan (pengajuan ulang ke-2) dengan melihat catatan penolakan dari personelia.`
  },
  /* Lembur disembunyikan sementara sesuai instruksi owner, kodingan tetap disimpan:
  {
    id: 'lembur',
    icon: 'schedule',
    title: 'Pengajuan Lembur',
    shortDesc: 'Input jam lembur & rincian tugas kerja',
    route: '/(tabs)/overtime',
    routeLabel: 'Buka Halaman Lembur',
    guideText: `⏱️ PANDUAN PENGAJUAN LEMBUR:\n\n1️⃣ Buka menu "Lembur" dari tab navigasi bawah.\n2️⃣ Klik tombol "+ Ajukan Lembur Baru".\n3️⃣ Pilih tanggal pelaksanaan lembur serta jam mulai dan jam selesai.\n4️⃣ Total jam kerja lembur akan dihitung secara otomatis oleh sistem.\n5️⃣ Tuliskan rincian tugas atau pekerjaan yang Anda selesaikan.\n6️⃣ Klik "Simpan Pengajuan" untuk diteruskan ke pimpinan untuk persetujuan.`
  },
  */
  {
    id: 'gaji',
    icon: 'payments',
    title: 'Slip Gaji Bulanan',
    shortDesc: 'Akses rincian gaji, PIN & cetak PDF',
    route: '/(tabs)/salary',
    routeLabel: 'Buka Halaman Slip Gaji',
    guideText: `💵 PANDUAN SLIP GAJI BULANAN:\n\n1️⃣ Masuk ke tab "Slip Gaji" pada menu navigasi bawah.\n2️⃣ Masukkan 6 digit PIN Keamanan Anda untuk otentikasi data finansial.\n3️⃣ Pilih periode bulan & tahun yang ingin dilihat.\n4️⃣ Anda dapat melihat rincian gaji pokok, tunjangan, dan potongan resmi.\n5️⃣ Tekan tombol "Cetak PDF" jika Anda membutuhkan dokumen cetak slip gaji.`
  },
  {
    id: 'profil',
    icon: 'assignment-ind',
    title: 'Data Diri & Kepegawaian',
    shortDesc: 'Melihat NIK, jabatan, cabang & potongan gaji',
    route: '/(tabs)/profile/employee-data',
    routeLabel: 'Buka Data Karyawan',
    guideText: `👤 PANDUAN DATA KARYAWAN:\n\n1️⃣ Masuk ke tab "Profil" lalu tekan "Data Karyawan".\n2️⃣ Terdapat tab "Informasi Pribadi" (NIK, Kontak, Alamat) dan tab "Data Kepegawaian" (Cabang, Jabatan, Tanggal Bergabung).\n3️⃣ Anda juga dapat memeriksa daftar potongan gaji terdaftar.\n4️⃣ Jika terdapat data yang keliru, gunakan tombol "Hubungi HRD" di bagian bawah untuk permohonan koreksi data.`
  },
  {
    id: 'keamanan',
    icon: 'lock',
    title: 'Ubah Password & Keamanan',
    shortDesc: 'Ganti password akun, PIN & sensor sidik jari',
    route: '/(tabs)/profile/change-password',
    routeLabel: 'Buka Ubah Password',
    guideText: `🔐 PANDUAN KEAMANAN & PASSWORD:\n\n1️⃣ Masuk ke tab "Profil" pada bagian "Pengaturan Akun & Keamanan".\n2️⃣ Pilih "Ubah Password" untuk memperbarui kata sandi login Anda.\n3️⃣ Pilih "Atur PIN Keamanan" jika ingin membuat atau memperbarui kode PIN akses slip gaji.\n4️⃣ Anda juga dapat mengaktifkan "Sidik Jari (Biometrik)" untuk login instan dengan sensor sidik jari.`
  }
];

export default function ChatSupportScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TutorialTopic | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load user login info and set personalized welcome greeting
  useEffect(() => {
    const initUserData = async () => {
      let resolvedName = 'Karyawan';
      try {
        const fullProfile = await AsyncStorage.getItem('fullProfile');
        if (fullProfile) {
          const parsed = JSON.parse(fullProfile);
          const candidate = parsed?.employee?.name || parsed?.user?.name;
          if (candidate) resolvedName = candidate;
        } else {
          const userData = await AsyncStorage.getItem('userData');
          if (userData) {
            const parsed = JSON.parse(userData);
            const candidate = parsed?.name || parsed?.employee?.name;
            if (candidate) resolvedName = candidate;
          }
        }
      } catch {
        // Fallback default
      }

      const cleanName = resolvedName
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages([
        {
          id: 'welcome-1',
          type: 'bot',
          text: `Halo, ${cleanName}! 👋\n\nSelamat datang di Pusat Panduan & Tutorial Aplikasi E-Karyawan.\n\nSilakan pilih topik panduan fitur pada tombol di bawah, lalu tekan Kirim untuk menampilkan petunjuk penggunaannya:`,
          time: currentTime
        }
      ]);
    };

    initUserData();
  }, []);

  const handleSendSelectedTopic = () => {
    if (!selectedTopic) return;

    const topicToSend = selectedTopic;
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Send user request message
    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: `Panduan ${topicToSend.title}`,
      time: currentTime
    };

    setMessages(prev => [...prev, userMsg]);
    setSelectedTopic(null); // Reset selection
    setIsTyping(true);

    // 2. Bot reply after brief natural delay
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        text: topicToSend.guideText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        topicRoute: topicToSend.route,
        topicRouteLabel: topicToSend.routeLabel
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 450);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isBot = item.type === 'bot';
    return (
      <View style={[styles.messageWrapper, isBot ? styles.messageWrapperBot : styles.messageWrapperUser]}>
        {isBot && (
          <View style={styles.botAvatar}>
            <MaterialIcons name="support-agent" size={18} color="#fff" />
          </View>
        )}
        <View style={[styles.messageBubble, isBot ? styles.messageBubbleBot : styles.messageBubbleUser]}>
          <Text style={[styles.messageText, isBot ? styles.messageTextBot : styles.messageTextUser]}>
            {item.text}
          </Text>

          {/* Action button inside bot guide bubble to navigate directly to the screen */}
          {item.topicRoute && item.topicRouteLabel ? (
            <TouchableOpacity 
              style={styles.directRouteButton}
              onPress={() => router.push(item.topicRoute as any)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="launch" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.directRouteButtonText}>{item.topicRouteLabel}</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.messageTime, isBot ? styles.messageTimeBot : styles.messageTimeUser]}>
            {item.time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen 
        options={{
          headerShown: true,
          title: "Tutorial Penggunaan",
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' }
        }} 
      />

      {/* CHAT MESSAGES LIST */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {isTyping && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>Asisten Tutorial sedang menyiapkan panduan...</Text>
        </View>
      )}

      {/* BOTTOM SELECTOR & SEND BAR (REPLACED CHAT TEXT INPUT) */}
      <View style={styles.bottomBarContainer}>
        <TouchableOpacity 
          style={[styles.topicSelectorInput, selectedTopic && styles.topicSelectorInputActive]}
          onPress={() => setIsModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.selectorLeftWrap}>
            <MaterialIcons 
              name={selectedTopic ? selectedTopic.icon : "list-alt"} 
              size={20} 
              color={selectedTopic ? theme.colors.primary : "#94a3b8"} 
            />
            <Text 
              style={[styles.selectorPlaceholderText, selectedTopic && styles.selectorActiveText]}
              numberOfLines={1}
            >
              {selectedTopic ? selectedTopic.title : "Pilih topik panduan..."}
            </Text>
          </View>
          <MaterialIcons 
            name="keyboard-arrow-down" 
            size={22} 
            color={selectedTopic ? theme.colors.primary : "#94a3b8"} 
          />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.sendButton, (!selectedTopic || isTyping) && styles.sendButtonDisabled]} 
          onPress={handleSendSelectedTopic}
          disabled={!selectedTopic || isTyping}
          activeOpacity={0.8}
        >
          <MaterialIcons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* MODAL POPUP LIST TOPIK PANDUAN */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.modalHeaderIconWrap}>
                  <MaterialIcons name="menu-book" size={20} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Pilih Topik Panduan</Text>
                  <Text style={styles.modalSubtitle}>Pilih fitur yang ingin Anda pelajari</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => setIsModalVisible(false)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.topicListScroll} showsVerticalScrollIndicator={false}>
              {TUTORIAL_TOPICS.map((topic) => {
                const isSelected = selectedTopic?.id === topic.id;
                return (
                  <TouchableOpacity
                    key={topic.id}
                    style={[styles.topicListItem, isSelected && styles.topicListItemActive]}
                    onPress={() => {
                      setSelectedTopic(topic);
                      setIsModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.topicItemIconCircle, isSelected && styles.topicItemIconCircleActive]}>
                      <MaterialIcons 
                        name={topic.icon} 
                        size={20} 
                        color={isSelected ? '#ffffff' : theme.colors.primary} 
                      />
                    </View>

                    <View style={styles.topicItemTextWrap}>
                      <Text style={[styles.topicItemTitle, isSelected && styles.topicItemTitleActive]}>
                        {topic.title}
                      </Text>
                      <Text style={styles.topicItemDesc} numberOfLines={1}>
                        {topic.shortDesc}
                      </Text>
                    </View>

                    <MaterialIcons 
                      name={isSelected ? "check-circle" : "radio-button-unchecked"} 
                      size={22} 
                      color={isSelected ? theme.colors.primary : "#cbd5e1"} 
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Chat Area
  chatContainer: {
    padding: theme.spacing.m,
    paddingBottom: theme.spacing.xl,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: theme.spacing.m,
    alignItems: 'flex-end',
  },
  messageWrapperUser: {
    justifyContent: 'flex-end',
  },
  messageWrapperBot: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: 14,
    borderRadius: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  messageBubbleBot: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageBubbleUser: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
  },
  messageTextBot: {
    color: '#1e293b',
  },
  messageTextUser: {
    color: '#ffffff',
  },

  // Direct Route Button inside Bot Bubble
  directRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  directRouteButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  messageTime: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  messageTimeBot: {
    color: '#94a3b8',
  },
  messageTimeUser: {
    color: 'rgba(255,255,255,0.7)',
  },

  typingIndicator: {
    paddingHorizontal: theme.spacing.l,
    paddingBottom: theme.spacing.s,
  },
  typingText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },

  // Bottom Selector & Send Bar
  bottomBarContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },
  topicSelectorInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 10,
  },
  topicSelectorInputActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  selectorLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
  },
  selectorPlaceholderText: {
    color: '#94a3b8',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  selectorActiveText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e1',
    elevation: 0,
  },

  // Modal Popup Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingHorizontal: 18,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 10,
  },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicListScroll: {
    paddingVertical: 6,
  },
  topicListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  topicListItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  topicItemIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topicItemIconCircleActive: {
    backgroundColor: theme.colors.primary,
  },
  topicItemTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  topicItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  topicItemTitleActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  topicItemDesc: {
    fontSize: 12,
    color: '#64748b',
  },
});
