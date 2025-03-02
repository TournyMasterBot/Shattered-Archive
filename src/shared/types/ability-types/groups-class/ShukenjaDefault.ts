import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Dodge from "@shared/types/ability-types/skills/dodge";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Healing from "@shared/types/ability-types/groups-spells/Healing";
import ServerCache from "@shared/cache/server-cache";
import Shukenja from "@shared/types/ability-types/groups-spells/Shukenja";

export class ShukenjaDefault implements IAbilityGroup {
  static instance: ShukenjaDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ShukenjaDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Shukenja.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      Parry.GetInstance(),
      Dodge.GetInstance(),
      SecondAttack.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShukenjaDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShukenjaDefault.GetInstance() as T;
  }
}

export default ShukenjaDefault;
