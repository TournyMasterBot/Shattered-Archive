import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelProtection implements IAbility {
  private static instance: DispelProtection;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
'DISPEL PROTECTION'
DISPEL PROTECTION

Syntax: cast 'dispel protection' <target>

The trained invoker has the ability to strip an opponent of many types of
protective spells. In this case, the casting of the dispel attempts to
strip the target of their protections against various alignments.

See also - INVOCATION INVOKER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DispelProtection.instance === undefined) {
      DispelProtection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DispelProtection {
    if (!DispelProtection.instance) {
      DispelProtection.instance = new DispelProtection();
    }
    return DispelProtection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DispelProtection.GetInstance() as T;
  }
}

export default DispelProtection;
