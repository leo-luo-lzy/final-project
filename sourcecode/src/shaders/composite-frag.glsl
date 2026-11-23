#version 300 es
precision highp float;

uniform sampler2D u_Accum;
uniform vec3 u_Paper;
uniform float u_InkStrength;
uniform int u_Mode;
uniform float u_PaperTex;

out vec4 out_Col;

vec3 randomGradient3D(vec3 p) {
    float r1 = fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float r2 = fract(sin(dot(p, vec3(269.5, 183.3, 246.1))) * 43758.5453);

    float z = r1 * 2.0 - 1.0;
    float phi = r2 * 6.28318530718;
    float radius = sqrt(max(0.0, 1.0 - z * z));

    return vec3(radius * cos(phi), radius * sin(phi), z);
}

float perlin3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    vec3 g000 = randomGradient3D(i + vec3(0, 0, 0));
    vec3 g100 = randomGradient3D(i + vec3(1, 0, 0));
    vec3 g010 = randomGradient3D(i + vec3(0, 1, 0));
    vec3 g110 = randomGradient3D(i + vec3(1, 1, 0));
    vec3 g001 = randomGradient3D(i + vec3(0, 0, 1));
    vec3 g101 = randomGradient3D(i + vec3(1, 0, 1));
    vec3 g011 = randomGradient3D(i + vec3(0, 1, 1));
    vec3 g111 = randomGradient3D(i + vec3(1, 1, 1));

    float v000 = dot(g000, f - vec3(0, 0, 0));
    float v100 = dot(g100, f - vec3(1, 0, 0));
    float v010 = dot(g010, f - vec3(0, 1, 0));
    float v110 = dot(g110, f - vec3(1, 1, 0));
    float v001 = dot(g001, f - vec3(0, 0, 1));
    float v101 = dot(g101, f - vec3(1, 0, 1));
    float v011 = dot(g011, f - vec3(0, 1, 1));
    float v111 = dot(g111, f - vec3(1, 1, 1));

    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float mix00 = mix(v000, v100, u.x);
    float mix10 = mix(v010, v110, u.x);
    float mix01 = mix(v001, v101, u.x);
    float mix11 = mix(v011, v111, u.x);

    float mix0 = mix(mix00, mix10, u.y);
    float mix1 = mix(mix01, mix11, u.y);

    return mix(mix0, mix1, u.z);
}

float fbmPerlin3D(vec3 p, int octaves, float lacunarity, float gain) {
    float sum = 0.0;
    float amp = 1.0;
    float norm = 0.0;

    for (int i = 0; i < octaves; ++i) {
        sum += amp * perlin3D(p);
        norm += amp;
        p *= lacunarity;
        amp *= gain;
    }
    return sum / max(norm, 1e-6);
}

float paperShade(vec2 p, out float h) {
    float mottle = fbmPerlin3D(vec3(p * 0.004, 1.7), 3, 2.0, 0.5);
    float fiber  = perlin3D(vec3(p.x * 0.01, p.y * 0.12, 3.1));
    float grain  = perlin3D(vec3(p * 0.35, 5.3));

    h = clamp(0.5 + 0.8 * grain + 0.3 * fiber, 0.0, 1.0);
    return 1.0 + u_PaperTex * (0.1 * mottle + 0.05 * fiber + 0.06 * grain);
}

void main() {
    vec4 acc = texelFetch(u_Accum, ivec2(gl_FragCoord.xy), 0);
    vec3 col;
    if (u_Mode == 0) {
        float h;
        float shade = paperShade(gl_FragCoord.xy, h);
        vec3 inkColor = acc.rgb / max(acc.a, 1e-4);
        float density = acc.a * mix(1.0, 0.6 + 0.8 * (1.0 - h), u_PaperTex);
        float coverage = 1.0 - exp(-u_InkStrength * density);
        col = mix(u_Paper, inkColor, coverage) * shade;
    } else {
        col = 1.0 - exp(-u_InkStrength * (acc.a - acc.rgb));
    }
    out_Col = vec4(col, 1.0);
}
