import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ProtectionGood implements IAbility {
  private static instance: ProtectionGood;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Protection Good'
'PROTECTION GOOD' 'PROTECTION EVIL' 'PROTECTION NEUTRAL'
'PROTECTION GOOD' 'PROTECTION EVIL' 'PROTECTION NEUTRAL'

Syntax: cast 'protection evil'
        cast 'protection good'
        cast 'protection neutral'

The protection spells reduce damage taken from attackers of the appropriate
ethos, and improve saving throws against all forms of magic. They may not
be cast on others, and one person cannot carry both defenses at the same
time.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "c 'protection good'";

    if (ProtectionGood.instance === undefined) {
      ProtectionGood.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ProtectionGood {
    if (!ProtectionGood.instance) {
      ProtectionGood.instance = new ProtectionGood();
    }
    return ProtectionGood.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ProtectionGood.GetInstance() as T;
  }
}

export default ProtectionGood;
