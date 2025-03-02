import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Parry from "@shared/types/ability-types/skills/parry";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Weather from "../groups-spells/Weather";
import Protective from "../groups-spells/Protective";
import Eldritch from "../groups-spells/Eldritch";
import Transportation from "../groups-spells/Transportation";
import ServerCache from "@shared/cache/server-cache";

export class EldritchDefault implements IAbilityGroup {
  static instance: EldritchDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.EldritchDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Enhancement.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Eldritch.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      Meditation.GetInstance(),
      Parry.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EldritchDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EldritchDefault.GetInstance() as T;
  }
}

export default EldritchDefault;
