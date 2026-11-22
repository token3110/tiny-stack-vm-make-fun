import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_MAX = 256;
const CALLS_MAX = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1_000_000;
const OUTPUT_MAX = 65_536;

function run(program: Uint8Array, input: Uint8Array) {
  const n = program.length;
  const D = new Int32Array(STACK_MAX);
  let sp = 0;
  const C = new Int32Array(CALLS_MAX);
  let csp = 0;
  const M = new Int32Array(MEMORY_WORDS);
  const out = new Uint8Array(OUTPUT_MAX);
  let olen = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;

  const push = (v: number) => {
    if (sp >= STACK_MAX) return 3;
    D[sp++] = v | 0;
    return 0;
  };
  const pop = (): number | null => sp > 0 ? D[--sp] : null;

  const read16 = (addr: number) => {
    if (addr < 0 || addr + 1 >= n) return null;
    return program[addr] | (program[addr + 1] << 8);
  };

  while (steps < STEP_LIMIT) {
    steps++;
    if (pc < 0 || pc >= n) return { stdout: out.subarray(0, olen), exit: 9 };
    const op = program[pc];

    if (op === 0x00) return { stdout: out.subarray(0, olen), exit: 0 }; // HALT

    if (op === 0x01) { // PUSH8
      if (pc + 1 >= n) return { stdout: out.subarray(0, olen), exit: 9 };
      const v = (program[pc + 1] << 24) >> 24;
      if (push(v)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc += 2;
      continue;
    }
    if (op === 0x02) { // PUSH32
      if (pc + 4 >= n) return { stdout: out.subarray(0, olen), exit: 9 };
      const v = program[pc + 1] | (program[pc + 2] << 8) | (program[pc + 3] << 16) | (program[pc + 4] << 24);
      if (push(v)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc += 5;
      continue;
    }
    if (op === 0x03) { // POP
      if (pop() === null) return { stdout: out.subarray(0, olen), exit: 2 };
      pc++;
      continue;
    }
    if (op === 0x04) { // DUP
      const a = pop();
      if (a === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(a) || push(a)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x05) { // SWAP
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(b) || push(a)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x10) { // ADD
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push((a + b) | 0)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x11) { // SUB
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push((a - b) | 0)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x12) { // MUL
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(Math.imul(a, b))) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x13) { // DIV
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (b === 0) return { stdout: out.subarray(0, olen), exit: 4 };
      if (push((a / b) | 0)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x17) { // NEG
      const a = pop();
      if (a === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push((-a) | 0)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x18) { // AND
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(a & b)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x19) { // OR
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(a | b)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x1a) { // XOR
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(a ^ b)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x1b) { // NOT
      const a = pop();
      if (a === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(\~a)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x20) { // EQ
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(a === b ? 1 : 0)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x21) { // LT
      const b = pop(); const a = pop();
      if (a === null || b === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (push(a < b ? 1 : 0)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x30) { // JMP
      const off = read16(pc + 1);
      if (off === null) return { stdout: out.subarray(0, olen), exit: 9 };
      pc = (pc + 3 + (off << 16 >> 16)) | 0;
      continue;
    }
    if (op === 0x31) { // JZ
      const off = read16(pc + 1);
      const v = pop();
      if (off === null || v === null) return { stdout: out.subarray(0, olen), exit: v === null ? 2 : 9 };
      pc = v === 0 ? (pc + 3 + (off << 16 >> 16)) | 0 : pc + 3;
      continue;
    }
    if (op === 0x32) { // JNZ
      const off = read16(pc + 1);
      const v = pop();
      if (off === null || v === null) return { stdout: out.subarray(0, olen), exit: v === null ? 2 : 9 };
      pc = v !== 0 ? (pc + 3 + (off << 16 >> 16)) | 0 : pc + 3;
      continue;
    }
    if (op === 0x33) { // CALL
      if (csp >= CALLS_MAX) return { stdout: out.subarray(0, olen), exit: 7 };
      const off = read16(pc + 1);
      if (off === null) return { stdout: out.subarray(0, olen), exit: 9 };
      C[csp++] = pc + 3;
      pc = (pc + 3 + (off << 16 >> 16)) | 0;
      continue;
    }
    if (op === 0x34) { // RET
      if (csp <= 0) return { stdout: out.subarray(0, olen), exit: 8 };
      pc = C[--csp];
      continue;
    }
    if (op === 0x40) { // LOAD
      const addr = pop();
      if (addr === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (addr < 0 || addr >= MEMORY_WORDS) return { stdout: out.subarray(0, olen), exit: 6 };
      if (push(M[addr])) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x41) { // STORE
      const val = pop(); const addr = pop();
      if (addr === null || val === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (addr < 0 || addr >= MEMORY_WORDS) return { stdout: out.subarray(0, olen), exit: 6 };
      M[addr] = val;
      pc++;
      continue;
    }
    if (op === 0x50) { // PRINT
      const v = pop();
      if (v === null) return { stdout: out.subarray(0, olen), exit: 2 };
      const s = String(v);
      if (olen + s.length > OUTPUT_MAX) return { stdout: out.subarray(0, olen), exit: 11 };
      for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
      pc++;
      continue;
    }
    if (op === 0x51) { // PUTC
      const v = pop();
      if (v === null) return { stdout: out.subarray(0, olen), exit: 2 };
      if (olen >= OUTPUT_MAX) return { stdout: out.subarray(0, olen), exit: 11 };
      out[olen++] = v & 255;
      pc++;
      continue;
    }
    if (op === 0x52) { // IN
      const b = inPos < input.length ? input[inPos++] : -1;
      if (push(b)) return { stdout: out.subarray(0, olen), exit: 3 };
      pc++;
      continue;
    }
    if (op === 0x53) { // EXIT
      const v = pop();
      if (v === null) return { stdout: out.subarray(0, olen), exit: 2 };
      return { stdout: out.subarray(0, olen), exit: v & 255 };
    }

    return { stdout: out.subarray(0, olen), exit: 5 }; // bad opcode
  }

  return { stdout: out.subarray(0, olen), exit: 10 }; // step limit
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const id of readdirSync(I).sort()) {
  const prog = readFileSync(join(I, id, 'program.bin'));
  const inp = readFileSync(join(I, id, 'input.bin'));
  const res = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), res.stdout);
  writeFileSync(join(O, id, 'exit.txt'), String(res.exit) + '\n');
}
