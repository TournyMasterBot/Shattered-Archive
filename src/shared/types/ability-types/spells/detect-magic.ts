import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectMagic implements IAbility {
  private static instance: DetectMagic;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Detect Magic'
'DETECT MAGIC'
Syntax: cast 'detect magic'

This spell enables the caster to detect magical objects. Additionally, if cast
in a room where magic resides, it will allow the caster to know what that magic
is and whom it originated from.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DetectMagic.instance === undefined) {
      DetectMagic.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DetectMagic {
    if (!DetectMagic.instance) {
      DetectMagic.instance = new DetectMagic();
    }
    return DetectMagic.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DetectMagic.GetInstance() as T;
  }
}

export default DetectMagic;
