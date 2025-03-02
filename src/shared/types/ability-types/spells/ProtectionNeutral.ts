import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ProtectionNeutral implements IAbility {
  private static instance: ProtectionNeutral;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Protection Neutral'
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
    this.abilityBuffCommand = "c 'protection neutral'";

    if (ProtectionNeutral.instance === undefined) {
      ProtectionNeutral.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ProtectionNeutral {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ProtectionNeutral.GetInstance() as T;
  }
}

export default ProtectionNeutral;
