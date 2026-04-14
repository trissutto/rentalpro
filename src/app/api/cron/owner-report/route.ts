import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("x-cron-secret");
    const cronSecret = process.env.CRON_SECRET || "rental-cron-secret";

    if (authHeader !== cronSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get month from query params or use previous month
    const { searchParams } = new URL(req.url);
    let monthParam = searchParams.get("month");

    let targetDate: Date;
    if (monthParam) {
      const [year, month] = monthParam.split("-");
      targetDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    } else {
      targetDate = subMonths(new Date(), 1);
    }

    const monthStart = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      1
    );
    const monthEnd = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    const monthName = format(monthStart, "MMMM yyyy", { locale: ptBR });

    // Get all active OWNER users
    const owners = await prisma.user.findMany({
      where: {
        role: "OWNER",
        active: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    let ownersSent = 0;
    const errors: string[] = [];

    // Process each owner
    for (const owner of owners) {
      try {
        // Get owner's properties
        const properties = await prisma.property.findMany({
          where: {
            ownerId: owner.id,
            active: true,
          },
          select: {
            id: true,
            name: true,
          },
        });

        // Collect data for each property
        const propertyData: Array<{
          name: string;
          reservas: number;
          receitaBruta: number;
          comissao: number;
          despesas: number;
          valorAReceber: number;
        }> = [];

        for (const property of properties) {
          // Count reservations
          const reservasCount = await prisma.reservation.count({
            where: {
              propertyId: property.id,
              checkIn: { gte: monthStart },
              checkOut: { lte: monthEnd },
              status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
            },
          });

          // Get income transactions
          const incomeTransactions = await prisma.financialTransaction.aggregate({
            where: {
              propertyId: property.id,
              type: "INCOME",
              category: "RESERVATION_INCOME",
              createdAt: {
                gte: monthStart,
                lte: monthEnd,
              },
            },
            _sum: { amount: true },
          });

          // Get commission transactions
          const commissionTransactions = await prisma.financialTransaction.aggregate({
            where: {
              propertyId: property.id,
              type: "EXPENSE",
              category: "OWNER_REPASSE",
              createdAt: {
                gte: monthStart,
                lte: monthEnd,
              },
            },
            _sum: { amount: true },
          });

          // Get expense transactions
          const expenseTransactions = await prisma.financialTransaction.aggregate({
            where: {
              propertyId: property.id,
              type: "EXPENSE",
              category: { not: "OWNER_REPASSE" },
              createdAt: {
                gte: monthStart,
                lte: monthEnd,
              },
            },
            _sum: { amount: true },
          });

          const receitaBruta = incomeTransactions._sum.amount || 0;
          const comissao = commissionTransactions._sum.amount || 0;
          const despesas = expenseTransactions._sum.amount || 0;
          const valorAReceber = receitaBruta - comissao - despesas;

          propertyData.push({
            name: property.name,
            reservas: reservasCount,
            receitaBruta,
            comissao,
            despesas,
            valorAReceber,
          });
        }

        // Build HTML email
        const htmlContent = buildOwnerReportEmail(owner.name, monthName, propertyData);

        // Send email
        const sent = await sendMail({
          to: owner.email,
          toName: owner.name,
          subject: `Relatório Mensal - ${monthName}`,
          html: htmlContent,
        });

        if (sent) {
          ownersSent++;
        } else {
          errors.push(`Falha ao enviar para ${owner.email}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Erro processando ${owner.email}: ${errorMsg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      ownersSent,
      errors,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Owner report cron error:", error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

function buildOwnerReportEmail(
  ownerName: string,
  month: string,
  propertyData: Array<{
    name: string;
    reservas: number;
    receitaBruta: number;
    comissao: number;
    despesas: number;
    valorAReceber: number;
  }>
): string {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const totalReceita = propertyData.reduce((sum, p) => sum + p.receitaBruta, 0);
  const totalComissao = propertyData.reduce((sum, p) => sum + p.comissao, 0);
  const totalDespesas = propertyData.reduce((sum, p) => sum + p.despesas, 0);
  const totalValorAReceber = propertyData.reduce(
    (sum, p) => sum + p.valorAReceber,
    0
  );

  const propertyRows = propertyData
    .map(
      (p) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left;">${p.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${p.reservas}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(p.receitaBruta)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #dc2626;">-${formatCurrency(p.comissao)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #dc2626;">-${formatCurrency(p.despesas)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold; color: #16a34a;">${formatCurrency(p.valorAReceber)}</td>
    </tr>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f3f4f6;
        margin: 0;
        padding: 20px;
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 40px 20px;
        text-align: center;
      }
      .header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
      }
      .content {
        padding: 40px 20px;
      }
      .greeting {
        font-size: 16px;
        color: #374151;
        margin-bottom: 30px;
      }
      .section-title {
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 20px;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
      }
      table th {
        background-color: #f3f4f6;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        color: #374151;
        border-bottom: 2px solid #d1d5db;
      }
      .summary {
        background-color: #f9fafb;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 30px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #e5e7eb;
      }
      .summary-row:last-child {
        border-bottom: none;
      }
      .summary-label {
        font-weight: 600;
        color: #374151;
      }
      .summary-value {
        font-weight: 600;
        color: #1f2937;
      }
      .total-row {
        background-color: #10b981;
        color: white;
        padding: 12px;
        text-align: right;
        font-weight: 700;
      }
      .footer {
        background-color: #f3f4f6;
        padding: 20px;
        text-align: center;
        color: #6b7280;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Relatório Mensal - ${month}</h1>
      </div>

      <div class="content">
        <p class="greeting">Olá <strong>${ownerName}</strong>,</p>
        <p class="greeting">Segue em anexo seu relatório financeiro detalhado dos imóveis referente ao mês de ${month}.</p>

        <div class="section-title">Resumo por Imóvel</div>

        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Reservas</th>
              <th>Receita Bruta</th>
              <th>Comissão</th>
              <th>Despesas</th>
              <th>Valor a Receber</th>
            </tr>
          </thead>
          <tbody>
            ${propertyRows}
          </tbody>
        </table>

        <div class="section-title">Totais</div>

        <div class="summary">
          <div class="summary-row">
            <span class="summary-label">Receita Bruta Total:</span>
            <span class="summary-value">${formatCurrency(totalReceita)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Comissão Total:</span>
            <span class="summary-value" style="color: #dc2626;">-${formatCurrency(totalComissao)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Despesas Totais:</span>
            <span class="summary-value" style="color: #dc2626;">-${formatCurrency(totalDespesas)}</span>
          </div>
          <div class="summary-row" style="border: none; margin-top: 10px; padding-top: 10px; padding-bottom: 0; border-top: 2px solid #d1d5db;">
            <span class="summary-label" style="font-size: 16px;">Valor Total a Receber:</span>
            <span class="summary-value" style="font-size: 16px; color: #16a34a;">${formatCurrency(totalValorAReceber)}</span>
          </div>
        </div>

        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          Para mais detalhes sobre suas transações, acesse sua conta no sistema de gestão de aluguel.
          Se tiver dúvidas, entre em contato com nossa equipe.
        </p>
      </div>

      <div class="footer">
        <p>RentalPro - Sistema de Gestão de Aluguel de Temporada</p>
        <p style="margin: 0; font-size: 12px;">Este é um email automático, por favor não responda.</p>
      </div>
    </div>
  </body>
</html>
  `;
}
