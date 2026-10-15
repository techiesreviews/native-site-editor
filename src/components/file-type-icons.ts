// The Files tab's icons by file type, loaded when the explorer first opens
// (about 2 KB, kept out of the boot bundle; rows show the plain file icon until then).
import fileArchive from "@phosphor-icons/core/regular/file-zip.svg?raw";
import fileAudio from "@phosphor-icons/core/regular/file-audio.svg?raw";
import fileCode from "@phosphor-icons/core/regular/file-code.svg?raw";
import fileCss from "@phosphor-icons/core/regular/file-css.svg?raw";
import fileDoc from "@phosphor-icons/core/regular/file-doc.svg?raw";
import fileHtml from "@phosphor-icons/core/regular/file-html.svg?raw";
import fileImage from "@phosphor-icons/core/regular/file-image.svg?raw";
import fileJs from "@phosphor-icons/core/regular/file-js.svg?raw";
import filePdf from "@phosphor-icons/core/regular/file-pdf.svg?raw";
import fileText from "@phosphor-icons/core/regular/file-text.svg?raw";
import fileVideo from "@phosphor-icons/core/regular/file-video.svg?raw";
import file from "@phosphor-icons/core/regular/file.svg?raw";
import textAa from "@phosphor-icons/core/regular/text-aa.svg?raw";
import type { FileType } from "./file-type";
import { sizedSvg, svgElement } from "../icons";

export { fileType, fileTypeLabel } from "./file-type";

const SHAPES: Record<FileType, string> = {
  page: fileHtml, style: fileCss, script: fileJs, data: fileCode, text: fileText, picture: fileImage,
  video: fileVideo, sound: fileAudio, pdf: filePdf, document: fileDoc, font: textAa, archive: fileArchive, other: file,
};

/** The type's icon, sized and hidden from assistive technology (the row carries the name). */
export const fileTypeIcon = (type: FileType, size = 16) => svgElement(sizedSvg(SHAPES[type], size));
