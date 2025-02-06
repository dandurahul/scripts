import * as fs from "fs/promises";
import * as path from "path";
import { format } from "prettier";
import * as dotenv from "dotenv";
dotenv.config();
const prismaClientPath = `${process.env.PRISMACLIENT}/node_modules/.prisma/client`;
const { PrismaClient } = require(prismaClientPath);
const prisma = new PrismaClient();

// Directory to save DTOs
const outputDir = path.resolve(`${process.env.PLACEHOLDER}`, `models`);

async function generateDTOs() {
  try {
    const tables: any =
      await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;

    for (const table of tables) {
      const modelName = table.table_name;
      if (modelName.startsWith("_")) {
        console.log(`Skipping model: ${modelName}`);
        continue;
      }

      const modelFields: any =
        await prisma.$queryRaw`SELECT column_name, data_type, is_nullable 
                                                    FROM information_schema.columns 
                                                    WHERE table_name = ${modelName}`;
      const dtoClassName = `${modelName}`;
      const dtoFilePath = path.join(outputDir, `${dtoClassName}.ts`);

      let dtoContent = `import { IsOptional, IsString, IsArray, IsBoolean, IsDate,IsNumber } from 'class-validator';\n\n`;
      dtoContent += `export class ${dtoClassName}BaseModel {\n`;

      // Step 3: Create DTO content based on columns
      for (const field of modelFields) {
        const fieldName = field.column_name;
        const fieldType = mapSQLTypeToTypeScript(field.data_type);
        const isNullable = field.is_nullable === "YES"; // Check if the column is nullable (optional)

        let decorators = "";
        if (isNullable) {
          decorators += `  @IsOptional()\n `;
        }

        if (field.data_type.includes("[]")) {
          // Check for array type
          decorators += `  @IsArray()\n`;
          decorators += `  @IsString({ each: true })\n`; // Assumed array of strings
        } else if (
          field.data_type === "text" ||
          field.data_type === "character varying"
        ) {
          decorators += `  @IsString()\n`;
        } else if (field.data_type === "boolean") {
          decorators += `  @IsBoolean()\n`;
        } else if (field.data_type === "timestamp without time zone") {
          decorators += `  @IsDate()\n`;
        } else if (
          ["integer", "bigint", "numeric", "double precision", "real"].includes(
            field.data_type
          )
        )
          decorators += `@IsNumber()\n`;
        if (isNullable) {
          // Determine if it should be required or optional (nullable)
          dtoContent += `${decorators}  ${fieldName}?: ${fieldType};\n\n`; // Optional field
        } else {
          dtoContent += `${decorators}  ${fieldName}!: ${fieldType};\n\n`; // Non-nullable (required) field
        }
      }

      dtoContent += `}\n`;

      // Format DTO with Prettier
      try {
        dtoContent = await format(dtoContent, {
          parser: "typescript",
          printWidth: 120,
        });
      } catch (prettierError: any) {
        console.warn(
          `Prettier failed to format ${dtoClassName}.ts: ${prettierError.message}`
        );
      }

      // Step 4: Save the DTO to the output directory
      await fs.writeFile(dtoFilePath, dtoContent);
      console.log(`✅ Generated DTO: ${dtoFilePath}`);
    }
  } catch (error) {
    console.error("❌ Error generating DTOs:", error);
    process.exit(1); // Exit with error code
  } finally {
    await prisma.$disconnect(); // Disconnect PrismaClient after use
    process.exit(0); // Exit successfully
  }
}

// Map SQL data types to TypeScript types
function mapSQLTypeToTypeScript(sqlType: string): string {
  switch (sqlType) {
    case "integer":
    case "bigint":
    case "numeric":
    case "double precision":
    case "real":
      return "number";
    case "character varying":
    case "text":
      return "string";
    case "boolean":
      return "boolean";
    case "timestamp without time zone":
      return "Date";
    case "json":
    case "jsonb":
      return "any";
    default:
      return "unknown";
  }
}

// Ensure the output directory exists and then generate DTOs
fs.mkdir(outputDir, { recursive: true })
  .then(() => generateDTOs())
  .catch((err) => {
    console.error("❌ Error creating directory or generating DTOs", err);
    process.exit(0); // Exit with error code if directory creation fails
  });
