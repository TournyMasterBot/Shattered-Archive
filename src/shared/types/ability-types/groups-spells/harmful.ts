import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CauseCritical from "@shared/types/ability-types/spells/cause-critical";
import Harm from "@shared/types/ability-types/spells/harm";
import CauseLight from "@shared/types/ability-types/spells/cause-light";
import CauseDecay from "@shared/types/ability-types/spells/cause-decay";
import CauseSerious from "@shared/types/ability-types/spells/cause-serious";
import CauseFatality from "@shared/types/ability-types/spells/cause-fatality";
import ServerCache from "@shared/cache/server-cache";

export class Harmful implements IAbilityGroup {
  static instance: Harmful;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Harmful;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CauseCritical.GetInstance(),
      Harm.GetInstance(),
      CauseLight.GetInstance(),
      CauseDecay.GetInstance(),
      CauseSerious.GetInstance(),
      CauseFatality.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Harmful {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Harmful.GetInstance() as T;
  }
}

export default Harmful;
