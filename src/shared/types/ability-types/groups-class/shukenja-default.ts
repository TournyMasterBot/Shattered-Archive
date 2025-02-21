import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Dodge from "@shared/types/ability-types/skills/dodge";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Healing from "../groups-spells/healing";
import Shukenja from "../groups-spells/shukenja";

export class ShukenjaDefault implements IAbilityGroup {
  static instance: ShukenjaDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.ShukenjaDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Shukenja.GetInstance().Get<Shukenja>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      Parry.GetInstance().Get(),
      Dodge.GetInstance().Get(),
      SecondAttack.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShukenjaDefault {
    if (!ShukenjaDefault.instance) {
      ShukenjaDefault.instance = new ShukenjaDefault();
    }
    return ShukenjaDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShukenjaDefault.GetInstance() as T;
  }
}

export default ShukenjaDefault;
