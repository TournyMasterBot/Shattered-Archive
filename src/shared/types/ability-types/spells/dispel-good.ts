import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelGood implements IAbility {
  private static instance: DispelGood;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Dispel Good'
'DISPEL GOOD'
DISPEL GOOD

Syntax: cast 'dispel good' <victim>

Dispel good brings forth evil energies that inflict horrific torment on the
pure of heart. Good-aligned characters use this dark magic at their peril.

See also - ATTACK
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DispelGood.instance === undefined) {
      DispelGood.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DispelGood {
    if (!DispelGood.instance) {
      DispelGood.instance = new DispelGood();
    }
    return DispelGood.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DispelGood.GetInstance() as T;
  }
}

export default DispelGood;
