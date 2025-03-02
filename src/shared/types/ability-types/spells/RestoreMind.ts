import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RestoreMind implements IAbility {
  private static instance: RestoreMind;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help restore mind
'RESTORE MIND'
RESTORE MIND

syntax: cast 'restore mind' <charmed target>

The intended target for this spell must be the charmed mob or player of an
attacking enemy. A successful cast will dissolve the binding of the charm
spell, causing the target to regain his free will. Failing this spell will
initiate combat and the recovery time is substantial.

Groups containing this spell: BEGUILING
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RestoreMind.instance === undefined) {
      RestoreMind.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RestoreMind {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RestoreMind.GetInstance() as T;
  }
}

export default RestoreMind;
