import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Detection from "../groups-spells/Detection";
import Illusion from "../groups-spells/Illusion";
import Maladictions from "../groups-spells/Maladictions";
import Protective from "../groups-spells/Protective";
import Shadowmagic from "../groups-spells/Shadowmagic";
import Transportation from "../groups-spells/Transportation";
import Weather from "../groups-spells/Weather";
import ServerCache from "@shared/cache/server-cache";

export class ShadowmageDefault implements IAbilityGroup {
  static instance: ShadowmageDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.ShadowmageDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Shadowmagic.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShadowmageDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShadowmageDefault.GetInstance() as T;
  }
}

export default ShadowmageDefault;
