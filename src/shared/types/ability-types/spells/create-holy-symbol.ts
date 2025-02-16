import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateHolySymbol implements IAbility {
  private static instance: CreateHolySymbol;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Create Holy Symbol";
    this.helpFile = `
help 'Create Holy Symbol'
'CREATE HOLY SYMBOL'
'CREATE HOLY SYMBOL'
Syntax:  cast 'create holy symbol'
Clerics may use this spell to forge a symbol of their faith. When worn, this
symbol serves to strengthen the clerics abilities. The symbol may not be taken
from the cleric in any fashion, nor may the cleric willingly give it to another
character.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateHolySymbol.instance === undefined) {
      CreateHolySymbol.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateHolySymbol {
    if (!CreateHolySymbol.instance) {
      CreateHolySymbol.instance = new CreateHolySymbol();
    }
    return CreateHolySymbol.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateHolySymbol.GetInstance() as T;
  }
}

export default CreateHolySymbol;
