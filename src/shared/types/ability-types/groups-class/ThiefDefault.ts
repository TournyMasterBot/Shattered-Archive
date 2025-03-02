import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/mace";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Trip from "@shared/types/ability-types/skills/trip";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import Sword from "@shared/types/ability-types/skills/sword";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Hide from "@shared/types/ability-types/skills/hide";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Backstab from "@shared/types/ability-types/skills/Backstab";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Peek from "@shared/types/ability-types/skills/peek";
import ServerCache from "@shared/cache/server-cache";

export class ThiefDefault implements IAbilityGroup {
  static instance: ThiefDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ThiefDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Mace.GetInstance(),
      Disarm.GetInstance(),
      Trip.GetInstance(),
      PickLock.GetInstance(),
      Sword.GetInstance(),
      Dodge.GetInstance(),
      Hide.GetInstance(),
      Sneak.GetInstance(),
      Backstab.GetInstance(),
      SecondAttack.GetInstance(),
      Peek.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ThiefDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ThiefDefault.GetInstance() as T;
  }
}

export default ThiefDefault;
