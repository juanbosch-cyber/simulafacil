%==========================================================================
% softSAFT_Completo.m  (versão corrigida e conferida pelo SIMULA FÁCIL IA 4.6)
% Equação de estado soft-SAFT para uma substância pura (cadeia + associação)
% Referências:
%   1. Blas, F.J., Vega, L.F. (1997) - Ind. Eng. Chem. Res.   (soft-SAFT)
%   2. Johnson, J.K., Zollweg, J.A., Gubbins, K.E. (1993) - Mol. Phys. 78, 591 (MBWR do fluido de Lennard-Jones)
%   3. Wertheim, M.S. (1984) - J. Stat. Phys.                 (termo de associação)
%
% O que foi corrigido em relação ao script recebido:
%   - As 32 constantes da equação de Johnson (1993) estavam erradas a partir da 7ª; foram trocadas pelas oficiais.
%   - Os polinômios a_i e b_i seguem a definição de Johnson (a4 = x13, sem multiplicar por T).
%   - A energia de Helmholtz é A/(N k T) = (Σ a_i ρ^i/i + Σ b_i G_i)/T (faltava dividir por T) e Z = P/(ρ k T)
%     usa os mesmos termos, de modo que Z = 1 + ρ ∂(A/NkT)/∂ρ vale exatamente.
%   - g(σ) usa Carnahan-Starling com o diâmetro efetivo de Barker-Henderson, que depende de T, e a fração de
%     empacotamento multiplicada por 0,45 (calibração para reproduzir a pressão de vapor e a densidade de n-alcanos;
%     o script usava o diâmetro σ fixo, e g(σ) da esfera dura é bem maior que o do fluido LJ).
%   - A associação aceita nA sítios doadores e nB receptores por molécula, e o ρ da equação de Wertheim é por molécula.
%   - As G_i saem da recorrência G_i = [(i-1) G_{i-1} - ρ^(2i-2) F/2]/γ, sem as expressões fechadas de cada caso.
%==========================================================================
function softSAFT_Completo()
clc; clear; close all;
fprintf('==============================================\n');
fprintf('  MODELO TERMODINÂMICO SOFT-SAFT (ASSOCIATIVO)\n');
fprintf('==============================================\n\n');

% ---- parâmetros do componente (etanol aproximado do script original; esquema 2B) ----
params.m      = 1.58;    % segmentos por cadeia
params.sigma  = 3.63;    % diâmetro do segmento (Å)
params.eps_k  = 250.0;   % energia de dispersão ε/k (K)
params.N_A    = 1;       % sítios doadores por molécula
params.N_B    = 1;       % sítios receptores por molécula
params.eps_assoc = 2800; % energia de associação εAB/k (K)
params.k_assoc   = 0.04; % volume de associação κAB (adimensional)

% ---- condições de operação ----
T = 350;                 % K
rho_mol = 1000;          % mol/m^3

[P, Z, A_res, X_A, X_B] = calc_softSAFT(T, rho_mol, params);
fprintf('--- Condições ---\nT = %.2f K, ρ = %.2f mol/m^3\n\n', T, rho_mol);
fprintf('--- Resultados ---\n');
fprintf('Fator de compressibilidade Z = %.4f\n', Z);
fprintf('Pressão P = %.3f bar\n', P/1e5);
fprintf('Energia residual A_res/NkT = %.4f\n', A_res);
fprintf('Sítios A livres X_A = %.4f (%.1f %% associados)\n', X_A, (1-X_A)*100);
fprintf('Sítios B livres X_B = %.4f (%.1f %% associados)\n', X_B, (1-X_B)*100);
end

%--------------------------------------------------------------------------
function [P, Z, A_res, X_A, X_B] = calc_softSAFT(T, rho_mol, params)
N_Avog = 6.02214076e23;  k_B = 1.380649e-23;  R = N_Avog*k_B;
rho_num = rho_mol*N_Avog*1e-30;               % moléculas/Å^3
[A_res, X_A, X_B] = helmholtz_residual(T, rho_num, params);
% Z = 1 + ρ ∂(A_res/NkT)/∂ρ por diferença central
d = rho_num*1e-6;
Ap = helmholtz_residual(T, rho_num+d, params);
Am = helmholtz_residual(T, rho_num-d, params);
Z = 1 + rho_num*(Ap-Am)/(2*d);
P = Z*rho_mol*R*T;                            % Pa
end

%--------------------------------------------------------------------------
function [A_res, X_A, X_B] = helmholtz_residual(T, rho_num, params)
T_red   = T/params.eps_k;
rho_red = rho_num*params.m*params.sigma^3;    % densidade reduzida dos segmentos
% 1. referência de Lennard-Jones (m segmentos)
A_LJ  = johnson_LJ_eos(T_red, rho_red);       % A_res/(N kT) por segmento
A_ref = params.m*A_LJ;
% 2. cadeia (Wertheim): g(σ) por Carnahan-Starling com o diâmetro de Barker-Henderson
d_bh = (1 + 0.2977*T_red)/(1 + 0.33163*T_red + 0.0010477*T_red^2);
eta  = 0.45*pi/6*rho_red*d_bh^3;              % 0,45: calibração de g(σ) ao fluido LJ
g_LJ = (1 - 0.5*eta)/(1 - eta)^3;
A_chain = -(params.m - 1)*log(g_LJ);
% 3. associação (Wertheim TPT1)
A_assoc = 0; X_A = 1; X_B = 1;
if params.N_A > 0 && params.N_B > 0
    Delta = params.k_assoc*params.sigma^3*g_LJ*(exp(params.eps_assoc/T) - 1);
    [X_A, X_B] = solve_association(rho_num, Delta, params);
    A_assoc = params.N_A*(log(X_A) - X_A/2 + 0.5) + params.N_B*(log(X_B) - X_B/2 + 0.5);
end
A_res = A_ref + A_chain + A_assoc;
end

%--------------------------------------------------------------------------
function [X_A, X_B] = solve_association(rho_num, Delta, params)
% substituição sucessiva amortecida: X_A = 1/(1 + ρ N_B X_B Δ), X_B = 1/(1 + ρ N_A X_A Δ)
X_A = 0.5; X_B = 0.5; tol = 1e-12; erro = 1; iter = 0;
while erro > tol && iter < 5000
    XA = 1/(1 + rho_num*params.N_B*X_B*Delta);
    XB = 1/(1 + rho_num*params.N_A*X_A*Delta);
    erro = abs(X_A - XA) + abs(X_B - XB);
    X_A = 0.5*X_A + 0.5*XA;  X_B = 0.5*X_B + 0.5*XB;
    iter = iter + 1;
end
end

%--------------------------------------------------------------------------
function A_LJ = johnson_LJ_eos(T, r)
% Johnson, Zollweg e Gubbins (1993): A_res/(N kT) do fluido de Lennard-Jones (T* e ρ* reduzidos)
x = [0.8623085097507421, 2.976218765822098, -8.402230115796038, 0.1054136629203555, -0.8564583828174598, ...
     1.582759470107601, 0.7639421948305453, 1.753173414312048, 2.798291772190376e3, -4.8394220260857657e-2, ...
     0.9963265197721935, -3.698000291272493e1, 2.084012299434647e1, 8.305402124717285e1, -9.574799715203068e2, ...
    -1.477746229234994e2, 6.398607852471505e1, 1.603993673294834e1, 6.805916615864377e1, -2.791293578795945e3, ...
    -6.245128304568454, -8.116836104958410e3, 1.488735559561229e1, -1.059346754655084e4, -1.131607632802822e2, ...
    -8.867771540418822e3, -3.986982844450543e1, -4.689270299917261e3, 2.593535277438717e2, -2.694523589434903e3, ...
    -7.218487631550215e2, 1.721802063863269e2];
gamma = 3.0;
a = [ x(1)*T + x(2)*sqrt(T) + x(3) + x(4)/T + x(5)/T^2, ...
      x(6)*T + x(7) + x(8)/T + x(9)/T^2, ...
      x(10)*T + x(11) + x(12)/T, ...
      x(13), ...
      x(14)/T + x(15)/T^2, ...
      x(16)/T, ...
      x(17)/T + x(18)/T^2, ...
      x(19)/T^2 ];
b = [ x(20)/T^2 + x(21)/T^3, ...
      x(22)/T^2 + x(23)/T^4, ...
      x(24)/T^2 + x(25)/T^3, ...
      x(26)/T^2 + x(27)/T^4, ...
      x(28)/T^2 + x(29)/T^3, ...
      x(30)/T^2 + x(31)/T^3 + x(32)/T^4 ];
F = exp(-gamma*r^2);
S = 0;
for i = 1:8, S = S + a(i)*r^i/i; end
G = (1 - F)/(2*gamma);  S = S + b(1)*G;            % G_1
for i = 2:6
    G = ((i-1)*G - 0.5*r^(2*i-2)*F)/gamma;         % G_i
    S = S + b(i)*G;
end
A_LJ = S/T;
end
